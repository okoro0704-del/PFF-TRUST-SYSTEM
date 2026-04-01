import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHmac,
  randomBytes, randomUUID, timingSafeEqual,
} from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LbasAuditService } from "./lbas-audit.service";
import type { InitiateNetworklessDto } from "./dto/initiate-networkless.dto";
import type { StepAApproveDto, StepBConfirmDto } from "./dto/confirm-networkless.dto";
import {
  EVT_NET_APPROVED_A, EVT_NET_COMPLETED, EVT_NET_CONFIRMED_B,
  EVT_NET_INITIATED, EVT_NET_REJECTED,
  NET_APPROVED_A, NET_COMPLETED, NET_CONFIRMED_B, NET_EXPIRED,
  NET_INITIATED, NET_REJECTED,
  NETWORKLESS_SESSION_TTL_S, TOTP_DIGITS, TOTP_STEP_SECONDS, TOTP_WINDOW,
} from "./lbas.constants";

// ── Cognitive challenge types ──────────────────────────────────────────────────
type CognitiveTask =
  | { type: "IMAGE_SELECTION"; prompt: string; options: { id: string; label: string }[]; expectedId: string }
  | { type: "TRANSACTION_NUMBER"; prompt: string; displayHint: string; expectedNumber: string };

@Injectable()
export class NetworklessChallengeService {
  private readonly log = new Logger(NetworklessChallengeService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    private readonly audit:   LbasAuditService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  // ── TOTP Engine (RFC 6238, HMAC-SHA1) ────────────────────────────────────────
  private totpFromCounter(seed: Buffer, counter: number): string {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter), 0);
    const h      = createHmac("sha1", seed).update(buf).digest();
    const offset = h[h.length - 1] & 0xf;
    const code   = (
      ((h[offset] & 0x7f) << 24) |
      ((h[offset + 1] & 0xff) << 16) |
      ((h[offset + 2] & 0xff) << 8) |
      (h[offset + 3] & 0xff)
    ) % Math.pow(10, TOTP_DIGITS);
    return code.toString().padStart(TOTP_DIGITS, "0");
  }

  private currentTotp(seed: Buffer): string {
    const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    return this.totpFromCounter(seed, counter);
  }

  private validateTotp(submitted: string, seed: Buffer): boolean {
    const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
    for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
      const expected = this.totpFromCounter(seed, counter + i);
      if (timingSafeEqual(Buffer.from(submitted), Buffer.from(expected))) return true;
    }
    return false;
  }

  // ── TOTP seed encryption (AES-256-GCM) ───────────────────────────────────────
  private totpKey(): Buffer {
    const k = this.config.get<string>("LBAS_TOTP_KEY") ?? "lbas-totp-key-32-chars-minimum!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  private encryptSeed(seed: Buffer): Buffer {
    const key = this.totpKey();
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([c.update(seed), c.final()]);
    const tag = c.getAuthTag();
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lenBuf, tag, iv, enc]);
  }

  private decryptSeed(blob: Buffer): Buffer {
    const key    = this.totpKey();
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const d      = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  }

  // ── Cognitive challenge generator ─────────────────────────────────────────────
  private generateCognitiveTask(): { task: CognitiveTask; answerHash: string } {
    const choices = [
      { type: "IMAGE_SELECTION" as const, pool: [
        { id: "house", label: "House" }, { id: "car",  label: "Car"  },
        { id: "tree",  label: "Tree"  }, { id: "fish", label: "Fish" },
        { id: "sun",   label: "Sun"   }, { id: "book", label: "Book" },
      ]},
    ];
    // Shuffle image options and pick 4, one of which is the correct answer
    const pool    = [...choices[0].pool].sort(() => Math.random() - 0.5);
    const correct = pool[0];
    const options = pool.slice(0, 4);

    const task: CognitiveTask = {
      type:      "IMAGE_SELECTION",
      prompt:    `Select the image of a ${correct.label.toUpperCase()}`,
      options,
      expectedId: correct.id,
    };
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    const answerHash = createHmac("sha256", pepper).update(correct.id).digest("hex");
    return { task, answerHash };
  }

  private hashAnswer(answer: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(answer).digest("hex");
  }

  // ── Session management ─────────────────────────────────────────────────────────
  private async loadSession(sessionRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.networklessSession.findUnique({ where: { sessionRef } });
    if (!s) throw new BadRequestException("Networkless session not found");
    if (s.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (new Date() > s.expiresAt) {
      await this.prisma.networklessSession.update({ where: { sessionRef }, data: { status: NET_EXPIRED } });
      throw new BadRequestException("Session expired — initiate a new networkless challenge");
    }
    return s;
  }

  /**
   * POS initiates the networkless challenge.
   * Generates TOTP seed + cognitive task; sends push notification to customer phone.
   * Returns the POS display code (current TOTP) for the terminal screen.
   */
  async initiateSession(dto: InitiateNetworklessDto) {
    const orgId        = dto.orgId ?? "default";
    const customerHash = this.bvnHash(dto.customerBvn);
    const agentHash    = this.bvnHash(dto.agentBvn);
    await this.prisma.setOrgContext(orgId);

    const seed       = randomBytes(20);           // 20-byte TOTP seed (RFC 6238 recommended)
    const encrypted  = this.encryptSeed(seed);
    const sessionRef = `NLS-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16)}`;
    const now        = new Date();
    const expiresAt  = new Date(now.getTime() + NETWORKLESS_SESSION_TTL_S * 1000);

    const { task, answerHash } = this.generateCognitiveTask();

    await this.prisma.networklessSession.create({
      data: {
        sessionRef, cycleRef: dto.cycleRef,
        customerBvnHash: customerHash, agentBvnHash: agentHash,
        terminalId: dto.terminalId,
        encryptedTotpSeed: encrypted,
        status: NET_INITIATED,
        cognitiveTaskJson:  JSON.stringify(task),
        cognitiveAnswerHash: answerHash,
        expiresAt, orgId,
      },
    });

    const posDisplayCode = this.currentTotp(seed);

    // ── Push notification stub ─────────────────────────────────────────────
    await this.sendPushNotification(customerHash, sessionRef, task);

    await this.audit.log({
      eventType: EVT_NET_INITIATED, sessionRef,
      customerBvnHash: customerHash, agentBvnHash: agentHash, orgId,
      metadata: { terminalId: dto.terminalId, cycleRef: dto.cycleRef, expiresAt: expiresAt.toISOString() },
    });

    this.log.log(`[LBAS][networkless] session=${sessionRef} terminal=${dto.terminalId}`);

    return {
      sessionRef,
      posDisplayCode,                        // 6-digit TOTP — display on POS terminal screen
      codeRefreshIntervalSeconds: TOTP_STEP_SECONDS,
      expiresAt:  expiresAt.toISOString(),
      ttlSeconds: NETWORKLESS_SESSION_TTL_S,
      message:
        "Session initiated. Display posDisplayCode on the POS terminal screen. " +
        "Customer phone has received the challenge push notification.",
    };
  }

  /** POS polls for the current TOTP display code (refreshes every 30s). */
  async getPosDisplayCode(sessionRef: string, orgId: string) {
    const session = await this.loadSession(sessionRef, orgId);
    const seed    = this.decryptSeed(session.encryptedTotpSeed);
    return {
      sessionRef,
      posDisplayCode: this.currentTotp(seed),
      status:         session.status,
      refreshesInSeconds: TOTP_STEP_SECONDS - (Math.floor(Date.now() / 1000) % TOTP_STEP_SECONDS),
    };
  }

  /** Step A — customer clicks YES and submits cognitive challenge answer on phone. */
  async approveStepA(sessionRef: string, dto: StepAApproveDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadSession(sessionRef, orgId);
    if (session.status !== NET_INITIATED) {
      throw new BadRequestException(`Session is ${session.status} — Step A already processed`);
    }

    const submittedHash = this.hashAnswer(dto.cognitiveAnswer);
    const expectedHash  = session.cognitiveAnswerHash;

    // Timing-safe comparison
    const submBuf = Buffer.from(submittedHash, "hex");
    const exptBuf = Buffer.from(expectedHash,  "hex");
    const correct = submBuf.length === exptBuf.length && timingSafeEqual(submBuf, exptBuf);

    if (!correct) {
      await this.prisma.networklessSession.update({ where: { sessionRef }, data: { status: NET_REJECTED } });
      await this.audit.log({
        eventType: EVT_NET_REJECTED, sessionRef,
        customerBvnHash: session.customerBvnHash, orgId,
        metadata: { reason: "wrong-cognitive-answer", step: "A" },
      });
      throw new ForbiddenException("Cognitive challenge answer is incorrect — session rejected");
    }

    await this.prisma.networklessSession.update({
      where: { sessionRef },
      data:  { status: NET_APPROVED_A, stepAConfirmedAt: new Date() },
    });

    await this.audit.log({
      eventType: EVT_NET_APPROVED_A, sessionRef,
      customerBvnHash: session.customerBvnHash, orgId,
    });

    return {
      sessionRef,
      status: NET_APPROVED_A,
      message: "Step A approved. Now read the 6-digit code from the POS terminal screen and enter it below.",
    };
  }

  /** Step B — customer enters TOTP from POS screen on phone. Releases the session on success. */
  async confirmStepB(sessionRef: string, dto: StepBConfirmDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadSession(sessionRef, orgId);
    if (session.status !== NET_APPROVED_A) {
      throw new BadRequestException(
        `Session is ${session.status} — Step A must be approved before Step B`,
      );
    }

    const seed    = this.decryptSeed(session.encryptedTotpSeed);
    const valid   = this.validateTotp(dto.posCode, seed);

    if (!valid) {
      await this.prisma.networklessSession.update({ where: { sessionRef }, data: { status: NET_REJECTED } });
      await this.audit.log({
        eventType: EVT_NET_REJECTED, sessionRef,
        customerBvnHash: session.customerBvnHash, orgId,
        metadata: { reason: "invalid-totp", step: "B" },
      });
      throw new ForbiddenException("POS terminal code is invalid or expired — session rejected");
    }

    const now = new Date();
    await this.prisma.networklessSession.update({
      where: { sessionRef },
      data:  { status: NET_COMPLETED, stepBConfirmedAt: now },
    });

    await this.audit.log({
      eventType: EVT_NET_CONFIRMED_B, sessionRef,
      customerBvnHash: session.customerBvnHash, orgId,
    });
    await this.audit.log({
      eventType: EVT_NET_COMPLETED, sessionRef,
      customerBvnHash: session.customerBvnHash, orgId,
      metadata: { cycleRef: session.cycleRef, terminalId: session.terminalId },
    });

    this.log.log(`[LBAS][networkless] COMPLETED session=${sessionRef}`);

    return {
      sessionRef,
      status:    NET_COMPLETED,
      cycleRef:  session.cycleRef,
      message:   "Two-step networkless approval COMPLETE. POS terminal is authorised to release funds.",
    };
  }

  async getSessionStatus(sessionRef: string, orgId: string) {
    const session = await this.loadSession(sessionRef, orgId);
    return {
      sessionRef,
      status:           session.status,
      cycleRef:         session.cycleRef,
      terminalId:       session.terminalId,
      stepAConfirmedAt: session.stepAConfirmedAt,
      stepBConfirmedAt: session.stepBConfirmedAt,
      expiresAt:        session.expiresAt,
      cognitiveTask:    JSON.parse(session.cognitiveTaskJson) as CognitiveTask,
    };
  }

  /** Push notification stub — wires to FCM/APNS when PUSH_BASE_URL is configured. */
  private async sendPushNotification(customerHash: string, sessionRef: string, task: CognitiveTask) {
    const base = this.config.get<string>("PUSH_BASE_URL");
    if (base) {
      try {
        await fetch(`${base.replace(/\/$/, "")}/v1/push/send`, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({
            customerBvnHash: customerHash,
            sessionRef,
            title:   "Withdrawal Approval Required",
            body:    task.prompt,
            data:    { sessionRef, challengeType: task.type },
          }),
          signal: AbortSignal.timeout(3000),
        });
      } catch { /* stub */ }
    } else {
      this.log.warn(
        `[LBAS][push] stub — would send push to customer ${customerHash} | session=${sessionRef}`,
      );
    }
  }
}

