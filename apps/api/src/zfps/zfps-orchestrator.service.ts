import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { BankLatencyMonitorService } from "./bank-latency-monitor.service";
import { SmsNotificationService } from "./sms-notification.service";
import { buildAccountOpeningRequest } from "./iso20022.builder";
import type { Iso20022AccountOpeningParams } from "./iso20022.builder";
import {
  VAULT_TTL_SECONDS, ZFPS_COMPLETED, ZFPS_FAILED,
  ZFPS_MANDATE_MS, ZFPS_PROVISIONING, ZFPS_VAULT_EXPIRED,
} from "./zfps.constants";

export interface ZfpsProvisionRequest {
  sessionRef:    string;
  nibssTokenId:  string;
  nibssMatchId:  string;
  bankCode:      string;
  accountType:   "SAVINGS" | "CURRENT";
  firstName:     string;
  lastName:      string;
  middleName?:   string;
  dateOfBirth:   string;
  gender:        "M" | "F";
  address:       string;
  stateOfOrigin: string;
  bvn:           string;
  phoneNumber:   string;
  orgId?:        string;
}

export interface ZfpsProvisionResult {
  accountNumber:   string;
  bankName:        string;
  iso20022MsgId:   string;
  iso20022Sha256:  string;
  cbsLatencyMs:    number;
  totalElapsedMs:  number;
  mandateMet:      boolean;
  smsSent:         boolean;
  smsProvider:     string;
  vaultMode:       "LIVE" | "FALLBACK";
}

function maskAccount(n: string): string { return `***${n.slice(-4)}`; }

/**
 * ZfpsOrchestratorService — the central provisioning engine.
 *
 * Flow (sub-60s mandate):
 *  1. Open Redis vault (60s NDPR TTL) — identity staged but never written to DB raw
 *  2. Look up bank BIC from national directory
 *  3. Build ISO 20022 acmt.001.001.08 XML message
 *  4. wrapCbsCall() → BankDirectoryService.pushToCbs() with live latency tracking
 *  5. Invalidate Redis vault immediately (data self-destructs)
 *  6. Write ZfpsProvisioningEvent audit trail (masked account number only)
 *  7. Send SMS via Termii — account number delivered to customer phone
 *  8. Return full result to caller
 */
@Injectable()
export class ZfpsOrchestratorService {
  private readonly log = new Logger(ZfpsOrchestratorService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly redis:    RedisService,
    private readonly bankDir:  BankDirectoryService,
    private readonly monitor:  BankLatencyMonitorService,
    private readonly sms:      SmsNotificationService,
  ) {}

  async provision(req: ZfpsProvisionRequest): Promise<ZfpsProvisionResult> {
    const orgId      = req.orgId ?? "default";
    const totalStart = performance.now();
    await this.prisma.setOrgContext(orgId);

    // ── 1. Open Redis vault ──────────────────────────────────────────────────
    const vaultOpenedAt = new Date();
    await this.redis.setVault(req.sessionRef, req, VAULT_TTL_SECONDS);
    await this.redis.setSessionState(req.sessionRef, { status: ZFPS_PROVISIONING, bankCode: req.bankCode });

    // ── 2. Bank lookup ───────────────────────────────────────────────────────
    const bank = this.bankDir.findByCode(req.bankCode);

    // ── 3. ISO 20022 message ─────────────────────────────────────────────────
    const isoParams: Iso20022AccountOpeningParams = {
      sessionRef:    req.sessionRef,
      nibssTokenId:  req.nibssTokenId,
      bankBic:       bank.swift,
      bankSortCode:  bank.code,
      bankName:      bank.name,
      firstName:     req.firstName,
      lastName:      req.lastName,
      middleName:    req.middleName,
      dateOfBirth:   req.dateOfBirth,
      gender:        req.gender,
      address:       req.address,
      stateOfOrigin: req.stateOfOrigin,
      bvn:           req.bvn,
      accountType:   req.accountType,
      orgId,
    };
    const isoMsg = buildAccountOpeningRequest(isoParams);
    this.log.log(`[ZFPS] ISO 20022 built — msgId: ${isoMsg.msgId} sha256: ${isoMsg.sha256.slice(0, 16)}…`);

    // ── 4. CBS call (latency-monitored) ─────────────────────────────────────
    let accountNumber = "";
    let cbsLatencyMs  = 0;
    let status        = ZFPS_FAILED;

    try {
      const wrapped = await this.monitor.wrapCbsCall(
        bank.code, bank.name, req.sessionRef,
        () => this.bankDir.pushToCbs(bank, { firstName: req.firstName, lastName: req.lastName, dateOfBirth: req.dateOfBirth, gender: req.gender, address: req.address, nibssTokenId: req.nibssTokenId, bvn: req.bvn }, req.accountType),
        "ACCOUNT_OPENING", orgId,
      );
      accountNumber = wrapped.result.accountNumber;
      cbsLatencyMs  = wrapped.result.elapsedMs as number;
      status        = ZFPS_COMPLETED;
    } catch (err) {
      this.log.error(`[ZFPS] CBS push failed: ${String(err)}`);
    }

    // ── 5. Invalidate vault immediately ──────────────────────────────────────
    const vaultClosedAt = new Date();
    const vaultAge      = vaultClosedAt.getTime() - vaultOpenedAt.getTime();
    await this.redis.invalidateVault(req.sessionRef);
    if (vaultAge >= VAULT_TTL_SECONDS * 1000) status = ZFPS_VAULT_EXPIRED;

    // ── 6. Audit trail ───────────────────────────────────────────────────────
    const totalElapsedMs = Math.round(performance.now() - totalStart);
    const mandateMet     = totalElapsedMs < ZFPS_MANDATE_MS && status === ZFPS_COMPLETED;

    const event = await this.prisma.zfpsProvisioningEvent.upsert({
      where:  { sessionRef: req.sessionRef },
      update: { status, cbsLatencyMs, accountNumberMasked: maskAccount(accountNumber), vaultClosedAt, completedAt: new Date(), mandateMet, iso20022MsgId: isoMsg.msgId },
      create: {
        sessionRef: req.sessionRef, bankCode: bank.code, bankName: bank.name,
        accountType: req.accountType, nibssMatchId: req.nibssMatchId,
        iso20022MsgId: isoMsg.msgId, vaultOpenedAt, vaultClosedAt,
        cbsLatencyMs, accountNumberMasked: maskAccount(accountNumber),
        status, mandateMet, orgId, completedAt: status === ZFPS_COMPLETED ? new Date() : null,
      },
    });

    // ── 7. SMS delivery ──────────────────────────────────────────────────────
    let smsSent = false; let smsProvider = "STUB";
    if (status === ZFPS_COMPLETED && accountNumber) {
      const smsResult = await this.sms.sendAccountCreated(req.phoneNumber, accountNumber, bank.name, req.accountType, req.sessionRef, orgId);
      smsSent     = smsResult.sent;
      smsProvider = smsResult.provider;
      await this.prisma.zfpsProvisioningEvent.update({
        where: { id: event.id },
        data: { smsSentAt: new Date(), smsDelivered: smsSent, smsProvider },
      });
    }

    this.log.log(`[ZFPS] ✓ ${bank.name} | ${maskAccount(accountNumber)} | ${totalElapsedMs}ms | mandate:${mandateMet} | SMS:${smsSent}`);
    return { accountNumber, bankName: bank.name, iso20022MsgId: isoMsg.msgId, iso20022Sha256: isoMsg.sha256, cbsLatencyMs, totalElapsedMs, mandateMet, smsSent, smsProvider, vaultMode: this.redis.vaultMode };
  }

  async getProvisioningPulse(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const all   = await this.prisma.zfpsProvisioningEvent.findMany({ where: { createdAt: { gte: today } } });
    const completed  = all.filter(e => e.status === ZFPS_COMPLETED);
    const smsSent    = all.filter(e => e.smsSentAt !== null);
    const mandateMet = all.filter(e => e.mandateMet === true);
    const avgLatency = completed.length ? Math.round(completed.reduce((s, e) => s + (e.cbsLatencyMs ?? 0), 0) / completed.length) : 0;
    return {
      todayCount:      all.length,
      successCount:    completed.length,
      successRate:     all.length ? +((completed.length / all.length) * 100).toFixed(1) : 0,
      avgCbsLatencyMs: avgLatency,
      smsCount:        smsSent.length,
      smsRate:         all.length ? +((smsSent.length / all.length) * 100).toFixed(1) : 0,
      mandateMetCount: mandateMet.length,
      mandateMetRate:  completed.length ? +((mandateMet.length / completed.length) * 100).toFixed(1) : 0,
      vaultMode:       this.redis.vaultMode,
    };
  }

  async getRecentEvents(orgId = "default", limit = 20) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.zfpsProvisioningEvent.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: limit });
  }
}

