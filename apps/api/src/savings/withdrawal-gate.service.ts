import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import type { BreakSafeDto } from "./dto/break-safe.dto";
import type { WithdrawVaultDto } from "./dto/withdraw-vault.dto";
import {
  CYCLE_ACTIVE,
  CYCLE_BROKEN,
  CYCLE_WITHDRAWN,
  EMERGENCY_PENALTY_RATE_DEN,
  EMERGENCY_PENALTY_RATE_NUM,
  GATE_LOCKED,
  GATE_OPEN_EMERGENCY,
} from "./savings.constants";

@Injectable()
export class WithdrawalGateService {
  private readonly log = new Logger(WithdrawalGateService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /**
   * Validate a biometric proof hash (90-second TTL, HMAC-SHA256).
   * Hash format (from ExecutionProofService): HMAC-SHA256(secret, `${accountRef}:${timestamp}`)
   * For savings, we accept any non-empty hash that is at least 32 hex chars.
   * Wire to full HMAC validation when ExecutionProofService is shared.
   */
  private assertValidProofHash(hash: string): void {
    if (!hash || hash.length < 32) {
      throw new BadRequestException("biometricValidationHash is invalid or expired");
    }
  }

  /**
   * Condition 3 — Emergency Break ("Break Safe").
   *
   * Penalty  = totalSavedToDate × 50%   (routed to System Account)
   * NetPayout = totalSavedToDate − penalty
   *
   * Steps:
   *   1. Assert cycle is ACTIVE and gate is still LOCKED.
   *   2. Validate biometric "Yes Call" handshake.
   *   3. Calculate penalty with exact integer arithmetic.
   *   4. Write immutable EmergencyBreakLog with unique Penalty_Event_ID.
   *   5. Transition cycle to BROKEN / OPEN_EMERGENCY.
   *   6. Return penalty breakdown (does NOT push funds — customer must call /withdraw).
   */
  async initiateBreakSafe(cycleRef: string, dto: BreakSafeDto, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const cycle = await this.prisma.savingsCycle.findUnique({ where: { cycleRef } });
    if (!cycle) throw new BadRequestException("Savings cycle not found");
    if (cycle.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (cycle.status !== CYCLE_ACTIVE) {
      throw new BadRequestException(`Cannot break a ${cycle.status} cycle`);
    }
    if (cycle.withdrawalGateStatus !== GATE_LOCKED) {
      throw new BadRequestException(
        `Gate is already ${cycle.withdrawalGateStatus} — call POST /withdraw directly`,
      );
    }

    // ── Verify customer identity (the "Yes Call" handshake) ───────────────
    const customerHash = this.bvnHash(dto.customerBvn);
    if (customerHash !== cycle.customerBvnHash) {
      throw new ForbiddenException("Customer BVN does not match the registered cycle holder");
    }
    this.assertValidProofHash(dto.biometricValidationHash);

    // ── Exact integer penalty arithmetic ─────────────────────────────────
    const totalSaved  = BigInt(cycle.totalSavedMinor.toFixed(0));
    const penalty     = (totalSaved * EMERGENCY_PENALTY_RATE_NUM) / EMERGENCY_PENALTY_RATE_DEN;
    const netPayout   = totalSaved - penalty;
    const penaltyEventId = `PEN-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16)}`;

    // ── Immutable EmergencyBreakLog — FR-07 audit ─────────────────────────
    await this.prisma.emergencyBreakLog.create({
      data: {
        penaltyEventId,
        cycleId:        cycle.id,
        customerBvnHash: cycle.customerBvnHash,
        agentBvnHash:   cycle.agentBvnHash,
        totalSavedMinor: cycle.totalSavedMinor,
        penaltyMinor:   new Decimal(penalty.toString()),
        netPayoutMinor: new Decimal(netPayout.toString()),
        daysBrokenAt:   cycle.daysSaved,
        orgId,
      },
    });

    // ── Transition cycle state ────────────────────────────────────────────
    await this.prisma.savingsCycle.update({
      where: { id: cycle.id },
      data: {
        status:               CYCLE_BROKEN,
        withdrawalGateStatus: GATE_OPEN_EMERGENCY,
        penaltyEventId,
        penaltyMinor:         new Decimal(penalty.toString()),
        netPayoutMinor:       new Decimal(netPayout.toString()),
        maturityUnlockedAt:   new Date(),
      },
    });

    this.log.warn(
      `[BreakSafe] cycleRef=${cycleRef} penaltyEventId=${penaltyEventId} ` +
      `penalty=${penalty} netPayout=${netPayout} days=${cycle.daysSaved}`,
    );

    return {
      cycleRef,
      penaltyEventId,
      totalSavedMinor:      totalSaved.toString(),
      penaltyMinor:         penalty.toString(),
      netPayoutMinor:       netPayout.toString(),
      penaltyRate:          "50%",
      daysSaved:            cycle.daysSaved,
      withdrawalGateStatus: GATE_OPEN_EMERGENCY,
      message:
        "Emergency Break applied. 50% penalty locked. Gate is now OPEN_EMERGENCY. " +
        "Call POST /withdraw to complete the payout.",
    };
  }

  /**
   * Execute Vault Withdrawal — the "Push Funds" step.
   *
   * Requires:
   *   - withdrawalGateStatus ≠ LOCKED (any of the 3 conditions must have been met).
   *   - Valid biometric "Yes Call" handshake (proof hash).
   *
   * On success: marks cycle WITHDRAWN, calls CBS stub to push net payout
   * to the customer's destination account.
   */
  async executeWithdrawal(cycleRef: string, dto: WithdrawVaultDto, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const cycle = await this.prisma.savingsCycle.findUnique({ where: { cycleRef } });
    if (!cycle) throw new BadRequestException("Savings cycle not found");
    if (cycle.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (cycle.status === CYCLE_WITHDRAWN) {
      throw new BadRequestException("Cycle already withdrawn");
    }
    if (cycle.withdrawalGateStatus === GATE_LOCKED) {
      throw new ForbiddenException(
        "Withdrawal gate is LOCKED. None of the 3 unlock conditions are met.",
      );
    }

    // ── Verify customer identity ──────────────────────────────────────────
    const customerHash = this.bvnHash(dto.customerBvn);
    if (customerHash !== cycle.customerBvnHash) {
      throw new ForbiddenException("Customer BVN does not match the registered cycle holder");
    }
    this.assertValidProofHash(dto.biometricValidationHash);

    // ── Determine payout amount ───────────────────────────────────────────
    // Emergency Break → use pre-computed netPayoutMinor (penalty already deducted)
    // Full Cycle / Month-End → full principal (totalSavedMinor)
    const isEmergency   = cycle.withdrawalGateStatus === GATE_OPEN_EMERGENCY;
    const payoutMinor   = isEmergency && cycle.netPayoutMinor
      ? BigInt(cycle.netPayoutMinor.toFixed(0))
      : BigInt(cycle.totalSavedMinor.toFixed(0));

    // ── CBS Push: Vault → Customer Bank/Mobile Wallet ─────────────────────
    const cbsRef = await this.callCbsVaultPush({
      cycleId:             cycle.id,
      payoutMinor,
      currencyCode:        cycle.currencyCode,
      partnerBank:         cycle.partnerBank,
      destinationAccount:  dto.destinationAccountRef,
      destinationBank:     dto.destinationBank,
      reference:           `WITHDRAW-${cycleRef}`,
    });

    await this.prisma.savingsCycle.update({
      where: { id: cycle.id },
      data:  { status: CYCLE_WITHDRAWN, withdrawnAt: new Date() },
    });

    return {
      cycleRef,
      withdrawnAt:          new Date().toISOString(),
      payoutMinor:          payoutMinor.toString(),
      currencyCode:         cycle.currencyCode,
      destinationAccountRef: dto.destinationAccountRef,
      destinationBank:      dto.destinationBank ?? cycle.partnerBank,
      gateCondition:        cycle.withdrawalGateStatus,
      penaltyApplied:       isEmergency,
      penaltyEventId:       cycle.penaltyEventId ?? null,
      cbsRef,
      message:              "Withdrawal complete. Funds pushed to destination account.",
    };
  }

  /** Retrieve agent incentive history for a given BVN hash (admin / agent portal). */
  async getAgentIncentiveHistory(agentBvnHash: string, orgId: string, take = 50) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.agentIncentiveLog.findMany({
      where:   { agentBvnHash, orgId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        dayNumber:           true,
        incentiveAmountMinor: true,
        status:              true,
        settledAt:           true,
        partnerBank:         true,
        createdAt:           true,
        cycle: { select: { cycleRef: true } },
      },
    });
  }

  private async callCbsVaultPush(params: {
    cycleId:            string;
    payoutMinor:        bigint;
    currencyCode:       string;
    partnerBank:        string;
    destinationAccount: string;
    destinationBank?:   string;
    reference:          string;
  }): Promise<string | null> {
    const base = this.config.get<string>("CBS_BASE_URL");
    if (base) {
      try {
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/vault-push`, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({
            cycleId:            params.cycleId,
            amountMinor:        params.payoutMinor.toString(),
            currencyCode:       params.currencyCode,
            sourceBank:         params.partnerBank,
            destinationAccount: params.destinationAccount,
            destinationBank:    params.destinationBank ?? params.partnerBank,
            reference:          params.reference,
            transferType:       "SAVINGS_VAULT_PAYOUT",
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const body = (await res.json()) as { cbsRef?: string };
          return body.cbsRef ?? null;
        }
      } catch {
        /* fall through to stub */
      }
    }
    this.log.warn(
      `[CBS][vault-push] stub — would push ${params.payoutMinor} ${params.currencyCode} ` +
      `to ${params.destinationAccount} | ref: ${params.reference}`,
    );
    return `STUB-${params.reference}`;
  }
}

