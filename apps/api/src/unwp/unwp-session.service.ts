import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHmac,
  randomBytes, randomUUID, timingSafeEqual,
} from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { LbasAuditService } from "../lbas/lbas-audit.service";
import type { InitiateUnwpDto } from "./dto/initiate-unwp.dto";
import type { StepAApproveUnwpDto, StepBConfirmUnwpDto } from "./dto/approve-unwp.dto";
import type { EscalateUnwpDto, SubmitEscalationBiometricDto } from "./dto/escalate-unwp.dto";
import { EscalationGate } from "./dto/escalate-unwp.dto";
import {
  EVT_UNWP_APPROVED_A, EVT_UNWP_BIOMETRIC_OK, EVT_UNWP_COMPLETED,
  EVT_UNWP_ESCALATED, EVT_UNWP_INITIATED, EVT_UNWP_REJECTED,
  UNWP_APPROVED_STEP_A, UNWP_BIOMETRIC_ESCALATION, UNWP_COMPLETED,
  UNWP_EXPIRED, UNWP_INITIATED, UNWP_REJECTED,
  UNWP_SESSION_TTL_S, UNWP_TASK_POOL, UNWP_TOTP_SKEW, UNWP_TOTP_STEP_S,
} from "./unwp.constants";

@Injectable()
export class UnwpSessionService {
  private readonly log = new Logger(UnwpSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly nibss:  NibssFactory,
    private readonly audit:  LbasAuditService,
  ) {}

  // ── Crypto helpers ─────────────────────────────────────────────────────────
  private bvnHash(bvn: string): string {
    const p = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", p).update(bvn.normalize("NFKC")).digest("hex");
  }
  private hmac(value: string): string {
    const p = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", p).update(value).digest("hex");
  }
  private totpKey(): Buffer {
    const k = this.config.get<string>("LBAS_TOTP_KEY") ?? "lbas-totp-key-32-chars-minimum!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }
  private encryptSeed(seed: Buffer): Buffer {
    const iv = randomBytes(12);
    const c  = createCipheriv("aes-256-gcm", this.totpKey(), iv);
    const enc = Buffer.concat([c.update(seed), c.final()]);
    const tag = c.getAuthTag();
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lenBuf, tag, iv, enc]);
  }
  private decryptSeed(blob: Buffer): Buffer {
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const d      = createDecipheriv("aes-256-gcm", this.totpKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  }
  private totpFromCounter(seed: Buffer, counter: number): string {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter), 0);
    const h = createHmac("sha1", seed).update(buf).digest();
    const offset = h[h.length - 1] & 0xf;
    const code = (
      ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) |
      ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff)
    ) % 1_000_000;
    return code.toString().padStart(6, "0");
  }
  private currentTotp(seed: Buffer): string {
    return this.totpFromCounter(seed, Math.floor(Date.now() / 1000 / UNWP_TOTP_STEP_S));
  }
  private validateTotp(submitted: string, seed: Buffer): boolean {
    const counter = Math.floor(Date.now() / 1000 / UNWP_TOTP_STEP_S);
    for (let i = -UNWP_TOTP_SKEW; i <= UNWP_TOTP_SKEW; i++) {
      const expected = this.totpFromCounter(seed, counter + i);
      if (timingSafeEqual(Buffer.from(submitted.padEnd(6, "0")), Buffer.from(expected))) return true;
    }
    return false;
  }

  // ── Cognitive task generator (transaction-oriented) ──────────────────────
  private buildCognitiveTask(amountMinor: bigint): { taskJson: string; answerHash: string; taskId: string } {
    const taskType = UNWP_TASK_POOL[Math.floor(Math.random() * UNWP_TASK_POOL.length)];
    const amountStr = amountMinor.toString();
    let prompt: string; let answer: string;

    switch (taskType) {
      case "CONFIRM_AMOUNT":
        prompt = `Confirm withdrawal of ₦${(Number(amountMinor) / 100).toFixed(2)} — tap YES to proceed`;
        answer = "YES";
        break;
      case "LAST_FOUR_DIGITS":
        prompt = `Enter the last 4 digits of the amount shown on the POS screen`;
        answer = amountStr.slice(-4).padStart(4, "0");
        break;
      case "ODD_OR_EVEN":
        prompt = `Is the withdrawal amount ODD or EVEN?`;
        answer = Number(amountMinor) % 2 === 0 ? "EVEN" : "ODD";
        break;
      case "DIGIT_SUM":
        prompt = `Enter the sum of all digits in the withdrawal amount`;
        answer = amountStr.split("").reduce((s, c) => s + Number(c), 0).toString();
        break;
      default:
        prompt = `Confirm the withdrawal — type YES`;
        answer = "YES";
    }
    return { taskJson: JSON.stringify({ type: taskType, prompt }), answerHash: this.hmac(answer), taskId: taskType };
  }

  // ── Public API ──────────────────────────────────────────────────────────────
  async initiateSession(dto: InitiateUnwpDto) {
    const orgId         = dto.orgId ?? "default";
    const customerHash  = this.bvnHash(dto.customerBvn);
    const agentHash     = this.bvnHash(dto.agentBvn);
    await this.prisma.setOrgContext(orgId);

    const seed      = randomBytes(20);
    const encrypted = this.encryptSeed(seed);
    const tli       = `TLI-${randomUUID()}`;
    const sessionRef = `UNWP-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + UNWP_SESSION_TTL_S * 1000);
    const amount    = BigInt(dto.amountMinor);
    const { taskJson, answerHash } = this.buildCognitiveTask(amount);

    await this.prisma.unwpSession.create({
      data: {
        sessionRef, tli, accountPublicRef: dto.accountPublicRef,
        customerBvnHash: customerHash, agentBvnHash: agentHash,
        terminalId: dto.terminalId, deviceId: dto.deviceId ?? null,
        encryptedTotpSeed: encrypted, status: UNWP_INITIATED,
        cognitiveTaskJson: taskJson, cognitiveAnswerHash: answerHash,
        amountMinor: amount, currencyCode: dto.currencyCode ?? "NGN", expiresAt, orgId,
      },
    });

    const posDisplayCode = this.currentTotp(seed);
    this.log.log(`[UNWP] session=${sessionRef} tli=${tli} terminal=${dto.terminalId}`);
    this.sendPushStub(dto.customerBvn, sessionRef, orgId);

    await this.audit.log({ eventType: EVT_UNWP_INITIATED, sessionRef, customerBvnHash: customerHash, agentBvnHash: agentHash, orgId,
      metadata: { tli, terminalId: dto.terminalId, deviceId: dto.deviceId, amountMinor: dto.amountMinor, mobilityFreedom: true },
    });
    return { sessionRef, tli, posDisplayCode, cognitiveTask: JSON.parse(taskJson), expiresAt,
      message: "UNWP session initiated. Phone push sent. Customer must complete Step-A then Step-B." };
  }

  async getPosDisplayCode(sessionRef: string, orgId: string) {
    const s = await this.loadSession(sessionRef, orgId);
    const seed = this.decryptSeed(Buffer.from(s.encryptedTotpSeed));
    return { sessionRef, posDisplayCode: this.currentTotp(seed), status: s.status,
      expiresAt: s.expiresAt, refreshEverySeconds: UNWP_TOTP_STEP_S };
  }

  async getSessionStatus(sessionRef: string, orgId: string) {
    const s = await this.loadSession(sessionRef, orgId);
    return { sessionRef, status: s.status, cognitiveTask: JSON.parse(s.cognitiveTaskJson),
      amountMinor: s.amountMinor.toString(), currencyCode: s.currencyCode, expiresAt: s.expiresAt };
  }

  async approveStepA(sessionRef: string, dto: StepAApproveUnwpDto) {
    const orgId = dto.orgId ?? "default";
    const s     = await this.loadSession(sessionRef, orgId);
    this.assertStatus(s.status, UNWP_INITIATED, "Step-A requires INITIATED status");

    const submitted = this.hmac(dto.cognitiveAnswer.trim().toUpperCase());
    const expected  = Buffer.from(s.cognitiveAnswerHash);
    if (!timingSafeEqual(Buffer.from(submitted), expected)) {
      await this.reject(sessionRef, orgId, "Cognitive answer mismatch");
      await this.audit.log({ eventType: EVT_UNWP_REJECTED, sessionRef, orgId, metadata: { reason: "cognitive_mismatch" } });
      throw new ForbiddenException("Cognitive challenge answer is incorrect — session rejected");
    }
    await this.prisma.unwpSession.update({ where: { sessionRef },
      data: { status: UNWP_APPROVED_STEP_A, stepAConfirmedAt: new Date() } });
    const seed = this.decryptSeed(Buffer.from(s.encryptedTotpSeed));
    await this.audit.log({ eventType: EVT_UNWP_APPROVED_A, sessionRef, orgId, metadata: { deviceId: dto.deviceId } });
    return { sessionRef, status: UNWP_APPROVED_STEP_A, posDisplayCode: this.currentTotp(seed),
      message: "Step-A approved. Enter the 6-digit code shown on the POS terminal to complete Step-B." };
  }

  async confirmStepB(sessionRef: string, dto: StepBConfirmUnwpDto) {
    const orgId = dto.orgId ?? "default";
    const s     = await this.loadSession(sessionRef, orgId);
    this.assertStatus(s.status, UNWP_APPROVED_STEP_A, "Step-B requires APPROVED_STEP_A status");

    const seed = this.decryptSeed(Buffer.from(s.encryptedTotpSeed));
    if (!this.validateTotp(dto.posCode, seed)) {
      await this.reject(sessionRef, orgId, "TOTP mismatch");
      await this.audit.log({ eventType: EVT_UNWP_REJECTED, sessionRef, orgId, metadata: { reason: "totp_mismatch" } });
      throw new ForbiddenException("POS code is invalid or expired — session rejected");
    }
    await this.prisma.unwpSession.update({ where: { sessionRef },
      data: { status: UNWP_COMPLETED, stepBConfirmedAt: new Date() } });
    await this.audit.log({ eventType: EVT_UNWP_COMPLETED, sessionRef, orgId, metadata: { deviceId: dto.deviceId, mobilityFreedom: true } });
    return { sessionRef, status: UNWP_COMPLETED, authorized: true,
      message: "UNWP completed. POS authorized to release funds. Commit to offline ledger immediately." };
  }

  // ── Biometric Escalation Failsafe ─────────────────────────────────────────
  async escalate(sessionRef: string, dto: EscalateUnwpDto) {
    const orgId = dto.orgId ?? "default";
    const s     = await this.loadSession(sessionRef, orgId);
    if ([UNWP_COMPLETED, UNWP_REJECTED, UNWP_EXPIRED].includes(s.status)) {
      throw new BadRequestException(`Cannot escalate session in status ${s.status}`);
    }
    await this.prisma.unwpSession.update({ where: { sessionRef },
      data: { status: UNWP_BIOMETRIC_ESCALATION, escalationReason: dto.escalationReason } });
    await this.audit.log({ eventType: EVT_UNWP_ESCALATED, sessionRef, orgId,
      metadata: { reason: dto.escalationReason, previousStatus: s.status } });
    return { sessionRef, status: UNWP_BIOMETRIC_ESCALATION,
      message: "Biometric escalation active. Submit Face or Fingerprint via POST /v1/unwp/:ref/escalation/biometric. Requires minimal network heartbeat for NIBSS." };
  }

  async submitEscalationBiometric(sessionRef: string, dto: SubmitEscalationBiometricDto) {
    const orgId = dto.orgId ?? "default";
    const s     = await this.loadSession(sessionRef, orgId);
    this.assertStatus(s.status, UNWP_BIOMETRIC_ESCALATION, "Biometric submission requires BIOMETRIC_ESCALATION status");

    const bundle   = this.nibss.create();
    const template = Buffer.from(dto.biometricTemplateB64, "base64");
    let result: { outcome: MatchOutcome; correlationId?: string };

    if (dto.gate === EscalationGate.FACE) {
      result = await bundle.biometric.verifyFace(dto.customerBvn, template);
    } else {
      result = await bundle.biometric.verifyFingerprint(dto.customerBvn, template);
    }
    const matched = result.outcome === MatchOutcome.MatchFound;
    if (!matched) {
      await this.audit.log({ eventType: EVT_UNWP_REJECTED, sessionRef, orgId, metadata: { gate: dto.gate, nibssOutcome: result.outcome } });
      throw new ForbiddenException(`Biometric escalation ${dto.gate} gate returned NO_MATCH — transaction denied`);
    }
    await this.prisma.unwpSession.update({ where: { sessionRef }, data: { status: UNWP_COMPLETED, stepBConfirmedAt: new Date() } });
    await this.audit.log({ eventType: EVT_UNWP_BIOMETRIC_OK, sessionRef, orgId,
      metadata: { gate: dto.gate, nibssCorrelationId: result.correlationId, sensorDeviceId: dto.sensorDeviceId } });
    return { sessionRef, status: UNWP_COMPLETED, authorized: true, biometricFallback: true, gate: dto.gate,
      nibssCorrelationId: result.correlationId,
      message: "Biometric escalation accepted. POS authorized to release funds. Commit to offline ledger." };
  }

  // ── Internals ──────────────────────────────────────────────────────────────
  private async loadSession(sessionRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.unwpSession.findUnique({ where: { sessionRef } });
    if (!s) throw new BadRequestException("UNWP session not found");
    if (s.status === UNWP_EXPIRED || (s.status !== UNWP_COMPLETED && s.expiresAt < new Date())) {
      await this.prisma.unwpSession.update({ where: { sessionRef }, data: { status: UNWP_EXPIRED } });
      throw new BadRequestException("UNWP session has expired");
    }
    return s;
  }
  private assertStatus(actual: string, expected: string, msg: string) {
    if (actual !== expected) throw new BadRequestException(`${msg} (current: ${actual})`);
  }
  private async reject(sessionRef: string, orgId: string, reason: string) {
    await this.prisma.unwpSession.update({ where: { sessionRef }, data: { status: UNWP_REJECTED } });
    this.log.warn(`[UNWP] session=${sessionRef} rejected: ${reason}`);
  }
  private sendPushStub(customerBvn: string, sessionRef: string, orgId: string) {
    this.log.warn(`[UNWP][push-stub] Push to BVN-linked phone for session=${sessionRef} orgId=${orgId} bvn=***${customerBvn.slice(-3)}`);
  }
}

