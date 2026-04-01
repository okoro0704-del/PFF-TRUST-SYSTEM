import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LbasAuditService } from "../lbas/lbas-audit.service";
import { NibssFactory } from "../nibss/nibss.factory";
import type { CommitLedgerDto, ReconcileLedgerDto } from "./dto/commit-ledger.dto";
import {
  EVT_LEDGER_COMMITTED, EVT_LEDGER_RECONCILED, EVT_LEDGER_REJECTED,
  LEDGER_QUEUED, LEDGER_RECONCILED, LEDGER_REJECTED, LEDGER_SUBMITTED,
  UNWP_BIOMETRIC_ESCALATION, UNWP_COMPLETED,
} from "./unwp.constants";

/** Full plaintext transaction record stored inside the encrypted payload. */
interface OfflinePayloadPlain {
  sessionRef:        string;
  tli:               string;
  terminalId:        string;
  customerBvnHash:   string;
  amountMinor:       string; // BigInt serialized as string
  currencyCode:      string;
  taskId:            string;
  biometricFallback: boolean;
  deviceId:          string | null;
  approvalTimestamp: string;
  committedAt:       string;
}

/**
 * PosOfflineLedgerService — Encrypted queue for UNWP offline transactions.
 *
 * Security model:
 *   - AES-256-GCM encryption using a terminal-class key (POS_LEDGER_KEY env var).
 *   - SHA-256 checksum of the plaintext payload; validated at reconciliation time.
 *   - Unique TLI constraint at DB level — prevents double-spend on re-submission.
 *   - Reconciliation submits to NIBSS stub; marks entry RECONCILED or REJECTED.
 *
 * In production the POS_LEDGER_KEY is burned into the POS hardware during terminal binding.
 */
@Injectable()
export class PosOfflineLedgerService {
  private readonly log = new Logger(PosOfflineLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly nibss:  NibssFactory,
    private readonly audit:  LbasAuditService,
  ) {}

  private ledgerKey(): Buffer {
    const k = this.config.get<string>("POS_LEDGER_KEY") ?? "pos-ledger-key-32-chars-minimum!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  private encrypt(plain: Buffer): Buffer {
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", this.ledgerKey(), iv);
    const enc = Buffer.concat([c.update(plain), c.final()]);
    const tag = c.getAuthTag();
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lenBuf, tag, iv, enc]);
  }

  private decrypt(blob: Buffer): Buffer {
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const d      = createDecipheriv("aes-256-gcm", this.ledgerKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]);
  }

  private sha256(buf: Buffer): string {
    return createHash("sha256").update(buf).digest("hex");
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Commit a completed UNWP session to the offline ledger.
   * Anti-double-spend: unique TLI constraint rejects any duplicate commit at DB level.
   */
  async commitTransaction(dto: CommitLedgerDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    const session = await this.prisma.unwpSession.findUnique({ where: { sessionRef: dto.sessionRef } });
    if (!session) throw new BadRequestException("UNWP session not found");
    const validStatuses = [UNWP_COMPLETED, UNWP_BIOMETRIC_ESCALATION];
    if (!validStatuses.includes(session.status) && session.status !== UNWP_COMPLETED) {
      throw new BadRequestException(`Cannot commit ledger for session in status ${session.status}. Session must be COMPLETED.`);
    }
    // Guard against duplicate commits
    const existing = await this.prisma.posOfflineLedger.findUnique({ where: { tli: session.tli } });
    if (existing) throw new ConflictException(`TLI ${session.tli} already committed — double-spend prevented`);

    const plain: OfflinePayloadPlain = {
      sessionRef: session.sessionRef, tli: session.tli, terminalId: session.terminalId,
      customerBvnHash: session.customerBvnHash, amountMinor: session.amountMinor.toString(),
      currencyCode: session.currencyCode, taskId: dto.taskId, biometricFallback: dto.biometricFallback,
      deviceId: dto.deviceId, approvalTimestamp: dto.approvalTimestamp, committedAt: new Date().toISOString(),
    };
    const plainBuf         = Buffer.from(JSON.stringify(plain), "utf8");
    const encryptedPayload = this.encrypt(plainBuf);
    const payloadChecksum  = this.sha256(plainBuf);

    const entry = await this.prisma.posOfflineLedger.create({
      data: {
        tli: session.tli, sessionRef: session.sessionRef, terminalId: session.terminalId,
        customerBvnHash: session.customerBvnHash, amountMinor: session.amountMinor,
        currencyCode: session.currencyCode, encryptedPayload, payloadChecksum,
        status: LEDGER_QUEUED, taskId: dto.taskId, biometricFallback: dto.biometricFallback,
        deviceId: dto.deviceId, approvalTimestamp: new Date(dto.approvalTimestamp), orgId,
      },
    });

    await this.audit.log({ eventType: EVT_LEDGER_COMMITTED, sessionRef: session.sessionRef, orgId,
      metadata: { tli: session.tli, terminalId: session.terminalId, amountMinor: plain.amountMinor,
        taskId: dto.taskId, biometricFallback: dto.biometricFallback, deviceId: dto.deviceId,
        approvalTimestamp: dto.approvalTimestamp },
    });
    this.log.log(`[UNWP][ledger] committed tli=${session.tli} sessionRef=${session.sessionRef}`);
    return { tli: entry.tli, sessionRef: entry.sessionRef, status: entry.status,
      message: "Transaction queued in encrypted offline ledger. Call POST /v1/unwp/ledger/reconcile when network is restored." };
  }

  /**
   * Reconcile all QUEUED entries for a terminal against NIBSS.
   * Double-spend safety: TLI uniqueness is enforced at DB level before this method even runs.
   * Checksum validation: SHA-256 of decrypted plaintext must match stored payloadChecksum.
   */
  async reconcileTerminal(dto: ReconcileLedgerDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    const queued = await this.prisma.posOfflineLedger.findMany({
      where: { terminalId: dto.terminalId, status: LEDGER_QUEUED, orgId },
      orderBy: { createdAt: "asc" },
    });

    this.log.log(`[UNWP][reconcile] terminal=${dto.terminalId} entries=${queued.length}`);
    const results: { tli: string; status: string; nibssCorrelationId?: string; reason?: string }[] = [];

    for (const entry of queued) {
      try {
        // 1. Decrypt payload
        const plainBuf = this.decrypt(Buffer.from(entry.encryptedPayload));

        // 2. Validate checksum — reject if tampered
        const actualChecksum = this.sha256(plainBuf);
        if (actualChecksum !== entry.payloadChecksum) {
          await this.prisma.posOfflineLedger.update({
            where: { tli: entry.tli },
            data: { status: LEDGER_REJECTED, rejectionReason: "Checksum mismatch — payload tampered" },
          });
          await this.audit.log({ eventType: EVT_LEDGER_REJECTED, sessionRef: entry.sessionRef, orgId,
            metadata: { tli: entry.tli, reason: "checksum_mismatch" } });
          results.push({ tli: entry.tli, status: LEDGER_REJECTED, reason: "checksum_mismatch" });
          continue;
        }

        // 3. Mark SUBMITTED before NIBSS call (idempotency guard)
        await this.prisma.posOfflineLedger.update({ where: { tli: entry.tli }, data: { status: LEDGER_SUBMITTED } });

        // 4. Submit to NIBSS reconciliation stub
        const payload = JSON.parse(plainBuf.toString("utf8")) as OfflinePayloadPlain;
        const bundle  = this.nibss.create();
        // NIBSS mobile ICAD is used for BVN portal credit notification
        const nibssRes = await bundle.mobile.verifyMobile(payload.customerBvnHash, payload.tli);
        const corrId   = nibssRes.correlationId;

        await this.prisma.posOfflineLedger.update({
          where: { tli: entry.tli },
          data: { status: LEDGER_RECONCILED, nibssCorrelationId: corrId, reconciledAt: new Date() },
        });
        await this.audit.log({ eventType: EVT_LEDGER_RECONCILED, sessionRef: entry.sessionRef, orgId,
          metadata: { tli: entry.tli, nibssCorrelationId: corrId, amountMinor: payload.amountMinor } });
        results.push({ tli: entry.tli, status: LEDGER_RECONCILED, nibssCorrelationId: corrId });
      } catch (err) {
        const reason = String(err);
        await this.prisma.posOfflineLedger.update({
          where: { tli: entry.tli },
          data: { status: LEDGER_REJECTED, rejectionReason: reason.slice(0, 512) },
        });
        await this.audit.log({ eventType: EVT_LEDGER_REJECTED, sessionRef: entry.sessionRef, orgId,
          metadata: { tli: entry.tli, reason } });
        results.push({ tli: entry.tli, status: LEDGER_REJECTED, reason });
      }
    }
    return { terminalId: dto.terminalId, totalProcessed: queued.length, results };
  }

  /** Get ledger status for a single entry by TLI. */
  async getLedgerEntry(tli: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const entry = await this.prisma.posOfflineLedger.findUnique({ where: { tli } });
    if (!entry) throw new BadRequestException(`No ledger entry found for TLI ${tli}`);
    return {
      tli: entry.tli, sessionRef: entry.sessionRef, terminalId: entry.terminalId,
      amountMinor: entry.amountMinor.toString(), currencyCode: entry.currencyCode,
      status: entry.status, taskId: entry.taskId, biometricFallback: entry.biometricFallback,
      deviceId: entry.deviceId, approvalTimestamp: entry.approvalTimestamp,
      nibssCorrelationId: entry.nibssCorrelationId, reconciledAt: entry.reconciledAt, createdAt: entry.createdAt,
    };
  }

  /** List all queued entries for a terminal (for POS health dashboard). */
  async getTerminalQueue(terminalId: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const entries = await this.prisma.posOfflineLedger.findMany({
      where: { terminalId, orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { tli: true, sessionRef: true, amountMinor: true, currencyCode: true,
        status: true, taskId: true, biometricFallback: true, approvalTimestamp: true,
        nibssCorrelationId: true, reconciledAt: true, createdAt: true },
    });
    return { terminalId, total: entries.length, entries };
  }
}

