import {
  BadRequestException, ForbiddenException, Injectable, Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { LocationAnchorService } from "./location-anchor.service";
import { TrustedAgentService } from "./trusted-agent.service";
import { ProximityService } from "./proximity.service";
import type { BepwgWithdrawDto } from "./dto/bepwg-withdraw.dto";
import {
  BYPASS_GATE_THRESHOLD,
  EMERGENCY_PENALTY_RATE_NUM, EMERGENCY_PENALTY_RATE_DEN,
  GATE_RESULT_ERROR, GATE_RESULT_MATCH, GATE_RESULT_NO_MATCH, GATE_RESULT_SKIPPED,
  MATURITY_EMERGENCY, MATURITY_FULL_CYCLE, MATURITY_MONTH_END,
  PROXIMITY_RADIUS_M,
  STANDARD_GATE_THRESHOLD,
  VERIFY_METHOD_BYPASS_TWO_GATE, VERIFY_METHOD_STANDARD_OFFLINE, VERIFY_METHOD_STANDARD_ONLINE,
} from "./bepwg.constants";

type GateOutcomes = { face: string; fingerprint: string; mobile: string };

@Injectable()
export class BepwgGateService {
  private readonly log = new Logger(BepwgGateService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly config:    ConfigService,
    private readonly nibss:     NibssFactory,
    private readonly liveness:  StubLivenessService,
    private readonly location:  LocationAnchorService,
    private readonly agent:     TrustedAgentService,
    private readonly proximity: ProximityService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  private static isLastDayOfMonth(d: Date): boolean {
    const tomorrow = new Date(d);
    tomorrow.setDate(d.getDate() + 1);
    return tomorrow.getMonth() !== d.getMonth();
  }

  /**
   * Run the YES Triad — only gates with provided templates are called.
   * Returns per-gate outcome labels and count of MatchFound results.
   */
  private async runBiometricGates(
    customerBvn: string,
    dto: { fingerprintTemplateB64?: string; faceTemplateB64?: string; mobileNumber?: string },
  ): Promise<{ outcomes: GateOutcomes; successCount: number }> {
    const bundle = this.nibss.create();
    const outcomes: GateOutcomes = {
      face:        GATE_RESULT_SKIPPED,
      fingerprint: GATE_RESULT_SKIPPED,
      mobile:      GATE_RESULT_SKIPPED,
    };

    const tasks: Promise<void>[] = [];

    if (dto.faceTemplateB64) {
      const faceBuf = Buffer.from(dto.faceTemplateB64, "base64");
      // Gate 1: liveness check before NIBSS face verification
      const live = await this.liveness.verifyPassive(faceBuf);
      if (!live.pass) throw new BadRequestException("Passive liveness check failed — Gate 1 (Face) rejected");
      tasks.push(
        bundle.biometric.verifyFace(customerBvn, faceBuf).then((r) => {
          outcomes.face = r.outcome === MatchOutcome.MatchFound ? GATE_RESULT_MATCH
                        : r.outcome === MatchOutcome.NoMatch    ? GATE_RESULT_NO_MATCH
                        : GATE_RESULT_ERROR;
        }),
      );
    }

    if (dto.fingerprintTemplateB64) {
      const fpBuf = Buffer.from(dto.fingerprintTemplateB64, "base64");
      tasks.push(
        bundle.biometric.verifyFingerprint(customerBvn, fpBuf).then((r) => {
          outcomes.fingerprint = r.outcome === MatchOutcome.MatchFound ? GATE_RESULT_MATCH
                               : r.outcome === MatchOutcome.NoMatch    ? GATE_RESULT_NO_MATCH
                               : GATE_RESULT_ERROR;
        }),
      );
    }

    if (dto.mobileNumber) {
      tasks.push(
        bundle.mobile.verifyMobile(customerBvn, dto.mobileNumber).then((r) => {
          outcomes.mobile = r.outcome === MatchOutcome.MatchFound ? GATE_RESULT_MATCH
                          : r.outcome === MatchOutcome.NoMatch    ? GATE_RESULT_NO_MATCH
                          : GATE_RESULT_ERROR;
        }),
      );
    }

    if (!tasks.length) {
      throw new BadRequestException(
        "At least one biometric gate must be provided: fingerprintTemplateB64 | faceTemplateB64 | mobileNumber",
      );
    }

    await Promise.all(tasks);
    const successCount = Object.values(outcomes).filter((v) => v === GATE_RESULT_MATCH).length;
    return { outcomes, successCount };
  }

  /** Retrieve cycle directly from Prisma (no SavingsModule dependency). */
  private async fetchCycle(cycleRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const cycle = await this.prisma.savingsCycle.findUnique({ where: { cycleRef } });
    if (!cycle) throw new BadRequestException("Savings cycle not found");
    if (cycle.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (cycle.status === "WITHDRAWN") throw new BadRequestException("Cycle already withdrawn");
    return cycle;
  }

  /**
   * BEPWG Main Withdrawal Gate — the Biometric Mandate + 10m Rule.
   *
   * Standard (1/3 gate): mature + within 10m + trusted agent.
   * Bypass  (2/3 gate): any condition above unmet; still penalises incomplete cycles.
   */
  async executeWithdrawal(dto: BepwgWithdrawDto, orgId: string) {
    const customerHash = this.bvnHash(dto.customerBvn);
    const agentHash    = this.bvnHash(dto.agentBvn);
    const now          = new Date();

    const cycle    = await this.fetchCycle(dto.cycleRef, orgId);
    const isMature = cycle.daysSaved >= 31
                  || BepwgGateService.isLastDayOfMonth(now)
                  || cycle.withdrawalGateStatus !== "LOCKED";
    const maturityLabel = cycle.daysSaved >= 31
      ? MATURITY_FULL_CYCLE
      : BepwgGateService.isLastDayOfMonth(now) ? MATURITY_MONTH_END : MATURITY_EMERGENCY;

    // ── GPS / proximity resolution ────────────────────────────────────────
    let proximityResult: { withinProximity: boolean; distanceM: number; anchorExists?: boolean };
    let verificationMethod: string;

    if (dto.isOffline) {
      if (!dto.offlineCacheToken) throw new BadRequestException("offlineCacheToken required for offline mode");
      const tokenPayload = this.proximity.validateOfflineToken(dto.offlineCacheToken);
      if (tokenPayload.customerBvnHash !== customerHash) {
        throw new ForbiddenException("offlineCacheToken does not match customer BVN");
      }
      proximityResult    = this.proximity.checkProximity(
        dto.gpsLatitude, dto.gpsLongitude,
        tokenPayload.latitudeDeg, tokenPayload.longitudeDeg, PROXIMITY_RADIUS_M,
      );
      verificationMethod = VERIFY_METHOD_STANDARD_OFFLINE;
    } else {
      proximityResult    = await this.location.checkProximity(customerHash, dto.gpsLatitude, dto.gpsLongitude, orgId);
      verificationMethod = VERIFY_METHOD_STANDARD_ONLINE;
    }

    const isTrusted      = await this.agent.isTrusted(customerHash, agentHash, orgId);
    const isStandardPath = isMature && proximityResult.withinProximity && isTrusted;
    const requiredGates  = isStandardPath ? STANDARD_GATE_THRESHOLD : BYPASS_GATE_THRESHOLD;
    if (!isStandardPath) verificationMethod = VERIFY_METHOD_BYPASS_TWO_GATE;

    this.log.log(`[BEPWG] ${dto.cycleRef} path=${isStandardPath ? "STANDARD" : "BYPASS"} mature=${isMature} within10m=${proximityResult.withinProximity} trusted=${isTrusted}`);

    // ── YES Triad ─────────────────────────────────────────────────────────
    const { outcomes, successCount } = await this.runBiometricGates(dto.customerBvn, dto);
    if (successCount < requiredGates) {
      throw new ForbiddenException({
        message:  `BEPWG gate rejected — ${successCount}/${requiredGates} YES calls required.`,
        path:     isStandardPath ? "STANDARD" : "BYPASS",
        required: requiredGates,
        achieved: successCount,
        outcomes,
      });
    }

    // ── Penalty if incomplete cycle ───────────────────────────────────────
    const totalSaved = BigInt(cycle.totalSavedMinor.toFixed(0));
    let penaltyMinor = 0n;
    let netPayout    = totalSaved;
    let penaltyEventId: string | null = null;

    if (!isMature) {
      penaltyMinor   = (totalSaved * 50n) / 100n;
      netPayout      = totalSaved - penaltyMinor;
      penaltyEventId = `PEN-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16)}`;
      await this.prisma.emergencyBreakLog.create({
        data: {
          penaltyEventId, cycleId: cycle.id,
          customerBvnHash: customerHash, agentBvnHash: agentHash,
          totalSavedMinor: cycle.totalSavedMinor,
          penaltyMinor: new Decimal(penaltyMinor.toString()),
          netPayoutMinor: new Decimal(netPayout.toString()),
          daysBrokenAt: cycle.daysSaved, orgId,
        },
      });
      await this.prisma.savingsCycle.update({
        where: { id: cycle.id },
        data: {
          status: "BROKEN", withdrawalGateStatus: "OPEN_EMERGENCY",
          penaltyEventId, penaltyMinor: new Decimal(penaltyMinor.toString()),
          netPayoutMinor: new Decimal(netPayout.toString()), maturityUnlockedAt: now,
        },
      });
    }

    // ── CBS Vault Push ────────────────────────────────────────────────────
    const cbsRef = await this.cbsPush({
      cycleId: cycle.id, amountMinor: netPayout, currencyCode: cycle.currencyCode,
      partnerBank: cycle.partnerBank, destinationAccount: dto.destinationAccountRef,
      destinationBank: dto.destinationBank, reference: `BEPWG-${dto.cycleRef}`,
    });
    await this.prisma.savingsCycle.update({ where: { id: cycle.id }, data: { status: "WITHDRAWN", withdrawnAt: now } });

    // ── Immutable Audit Log ───────────────────────────────────────────────
    const withdrawalRef = `WDR-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16)}`;
    await this.prisma.bepwgWithdrawalLog.create({
      data: {
        withdrawalRef, cycleRef: dto.cycleRef, customerBvnHash: customerHash, agentBvnHash: agentHash,
        gpsLatitude: new Decimal(dto.gpsLatitude.toFixed(7)), gpsLongitude: new Decimal(dto.gpsLongitude.toFixed(7)),
        distanceFromAnchorM: new Decimal(Math.min(proximityResult.distanceM, 99999999).toFixed(2)),
        withinProximity: proximityResult.withinProximity, verificationMethod,
        gatesPassedJson: JSON.stringify(outcomes), gatesPassedCount: successCount,
        grossAmountMinor: cycle.totalSavedMinor,
        penaltyMinor: new Decimal(penaltyMinor.toString()), netAmountMinor: new Decimal(netPayout.toString()),
        penaltyEventId, cycleMaturity: maturityLabel, orgId,
      },
    });
    await this.agent.upsertLink(customerHash, agentHash, orgId);

    return {
      withdrawalRef, cycleRef: dto.cycleRef, executedAt: now.toISOString(),
      verificationMethod, gatesPassedCount: successCount, gateOutcomes: outcomes,
      withinProximity: proximityResult.withinProximity,
      distanceFromAnchorM: proximityResult.distanceM.toFixed(2),
      grossAmountMinor: totalSaved.toString(), penaltyMinor: penaltyMinor.toString(),
      netAmountMinor: netPayout.toString(), penaltyEventId, cycleMaturity: maturityLabel,
      destinationAccountRef: dto.destinationAccountRef, cbsRef,
    };
  }

  /** Get immutable BEPWG audit log for a cycle. */
  async getWithdrawalLog(cycleRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.bepwgWithdrawalLog.findMany({ where: { cycleRef, orgId }, orderBy: { executedAt: "desc" } });
  }

  private async cbsPush(p: {
    cycleId: string; amountMinor: bigint; currencyCode: string; partnerBank: string;
    destinationAccount: string; destinationBank?: string; reference: string;
  }): Promise<string | null> {
    const base = this.config.get<string>("CBS_BASE_URL");
    if (base) {
      try {
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/vault-push`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...p, amountMinor: p.amountMinor.toString(), transferType: "BEPWG_WITHDRAWAL" }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return ((await res.json()) as { cbsRef?: string }).cbsRef ?? null;
      } catch { /* stub */ }
    }
    this.log.warn(`[CBS][bepwg-push] stub | ref: ${p.reference} | amount: ${p.amountMinor}`);
    return `STUB-${p.reference}`;
  }
}
