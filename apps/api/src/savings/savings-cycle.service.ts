import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import { AgentIncentiveService } from "./agent-incentive.service";
import { TrustedAgentService } from "../bepwg/trusted-agent.service";
import type { OpenCycleDto } from "./dto/open-cycle.dto";
import type { DailyDepositDto } from "./dto/daily-deposit.dto";
import {
  AGENT_LIQUIDITY_RATIO_DEN,
  AGENT_LIQUIDITY_RATIO_NUM,
  CYCLE_ACTIVE,
  CYCLE_MATURED_FULL_CYCLE,
  CYCLE_MATURED_MONTH_END,
  FULL_CYCLE_DAYS,
  GATE_LOCKED,
  GATE_OPEN_FULL_CYCLE,
  GATE_OPEN_MONTH_END,
} from "./savings.constants";

@Injectable()
export class SavingsCycleService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly config:        ConfigService,
    private readonly incentive:     AgentIncentiveService,
    private readonly trustedAgent:  TrustedAgentService,
  ) {}

  // ── BVN hashing (same HMAC pattern as TerminalService / VerificationService) ─
  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /** TRUE if today is the last calendar day of the month (WAT-aware via server TZ). */
  static isLastDayOfMonth(date: Date): boolean {
    const tomorrow = new Date(date);
    tomorrow.setDate(date.getDate() + 1);
    return tomorrow.getMonth() !== date.getMonth();
  }

  /**
   * Open a new savings cycle (Day 1 — First Payment).
   * Records the Day-1 deposit, calculates the Agent Liquidity stake (60%),
   * and seeds the cycle with ACTIVE status and LOCKED gate.
   */
  async openCycle(dto: OpenCycleDto) {
    const orgId          = dto.orgId ?? "default";
    const customerHash   = this.bvnHash(dto.customerBvn);
    const agentHash      = this.bvnHash(dto.agentBvn);
    const currencyCode   = dto.currencyCode ?? "NGN";

    // ── Exact integer arithmetic for all monetary values ──────────────────
    const day1Fee       = BigInt(dto.day1TotalFeeMinor);
    const agentLiq      = (day1Fee * AGENT_LIQUIDITY_RATIO_NUM) / AGENT_LIQUIDITY_RATIO_DEN;
    const dailyDeposit  = BigInt(dto.dailyDepositMinor);

    const cycleRef  = `CYC-${randomBytes(6).toString("hex").toUpperCase()}`;
    const now       = new Date();

    await this.prisma.setOrgContext(orgId);

    const cycle = await this.prisma.savingsCycle.create({
      data: {
        cycleRef,
        customerBvnHash:     customerHash,
        agentBvnHash:        agentHash,
        day1TotalFeeMinor:   new Decimal(day1Fee.toString()),
        agentLiquidityMinor: new Decimal(agentLiq.toString()),
        dailyDepositMinor:   new Decimal(dailyDeposit.toString()),
        totalSavedMinor:     new Decimal(day1Fee.toString()), // Day-1 fee IS the first saved amount
        daysSaved:           1,
        currencyCode,
        partnerBank:         dto.partnerBank,
        status:              CYCLE_ACTIVE,
        withdrawalGateStatus: GATE_LOCKED,
        startDate:           now,
        orgId,
      },
    });

    // ── Day-1 deposit log entry ────────────────────────────────────────────
    await this.prisma.dailyDepositLog.create({
      data: {
        cycleId:    cycle.id,
        dayNumber:  1,
        amountMinor: new Decimal(day1Fee.toString()),
        orgId,
      },
    });

    // ── Establish Trusted Agent Link (BEPWG prerequisite) ─────────────────
    // Seeds the link so the standard 1-gate BEPWG withdrawal path is immediately
    // available once the cycle matures — no separate trust-link call required.
    await this.trustedAgent.upsertLink(customerHash, agentHash, orgId);

    return {
      cycleRef,
      status:              cycle.status,
      withdrawalGateStatus: cycle.withdrawalGateStatus,
      daysSaved:           1,
      agentLiquidityMinor: agentLiq.toString(),
      dailyIncentiveMinor: ((agentLiq * 2n) / 100n).toString(),
      trustedLinkEstablished: true,
      message:             "Cycle opened. Day-1 First Payment recorded. Agent Liquidity stake captured. Trusted Agent Link established.",
    };
  }

  /**
   * Record a daily deposit (Day 2–31).
   *
   * Rules:
   *   - Cycle must be ACTIVE.
   *   - dayNumber must equal daysSaved + 1 (sequential, no gaps).
   *   - Amount must match dailyDepositMinor on the cycle.
   *   - Triggers Agent Incentive disbursement (Day 2 onward).
   *   - Re-evaluates and updates the Tri-Condition gate after every deposit.
   */
  async recordDeposit(cycleRef: string, dto: DailyDepositDto, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const cycle = await this.prisma.savingsCycle.findUnique({ where: { cycleRef } });
    if (!cycle) throw new BadRequestException("Savings cycle not found");
    if (cycle.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (cycle.status !== CYCLE_ACTIVE) {
      throw new BadRequestException(`Cycle is ${cycle.status} — deposits are only accepted on ACTIVE cycles`);
    }
    if (cycle.daysSaved >= FULL_CYCLE_DAYS) {
      throw new BadRequestException("Cycle already complete (31 days saved)");
    }

    const expectedAmount = BigInt(cycle.dailyDepositMinor.toFixed(0));
    const depositAmount  = BigInt(dto.amountMinor);
    if (depositAmount !== expectedAmount) {
      throw new BadRequestException(
        `Deposit amount ${depositAmount} does not match expected ${expectedAmount}`,
      );
    }

    const dayNumber = cycle.daysSaved + 1;

    // ── Guard: no duplicate for this day ─────────────────────────────────
    const existing = await this.prisma.dailyDepositLog.findUnique({
      where: { cycleId_dayNumber: { cycleId: cycle.id, dayNumber } },
    });
    if (existing) throw new ConflictException(`Day ${dayNumber} deposit already recorded`);

    // ── Append deposit log ────────────────────────────────────────────────
    const deposit = await this.prisma.dailyDepositLog.create({
      data: {
        cycleId:                cycle.id,
        dayNumber,
        amountMinor:            new Decimal(depositAmount.toString()),
        biometricValidationHash: dto.biometricValidationHash ?? null,
        orgId,
      },
    });

    const newTotal   = BigInt(cycle.totalSavedMinor.toFixed(0)) + depositAmount;
    const newDays    = dayNumber;
    const now        = new Date();

    // ── Evaluate gate before updating cycle ──────────────────────────────
    const newGate   = this.evaluateGate(newDays, now, cycle.withdrawalGateStatus);
    const isMatured = newDays >= FULL_CYCLE_DAYS;
    const newStatus = isMatured ? CYCLE_MATURED_FULL_CYCLE
                    : newGate === GATE_OPEN_MONTH_END ? CYCLE_MATURED_MONTH_END
                    : CYCLE_ACTIVE;

    await this.prisma.savingsCycle.update({
      where: { id: cycle.id },
      data: {
        totalSavedMinor:      new Decimal(newTotal.toString()),
        daysSaved:            newDays,
        status:               newStatus,
        withdrawalGateStatus: newGate,
        maturityUnlockedAt:   newGate !== GATE_LOCKED && !cycle.maturityUnlockedAt ? now : undefined,
      },
    });

    // ── Disburse agent incentive (Day 2–31) ───────────────────────────────
    let incentiveResult: { incentiveMinor: bigint; status: string } | null = null;
    if (dayNumber >= 2) {
      incentiveResult = await this.incentive.disburseIncentive({
        cycleId:             cycle.id,
        depositId:           deposit.id,
        dayNumber,
        agentLiquidityMinor: cycle.agentLiquidityMinor,
        agentBvnHash:        cycle.agentBvnHash,
        partnerBank:         cycle.partnerBank,
        orgId,
      });
    }

    return {
      cycleRef,
      dayNumber,
      totalSavedMinor:      newTotal.toString(),
      daysSaved:            newDays,
      status:               newStatus,
      withdrawalGateStatus: newGate,
      agentIncentive:       incentiveResult
        ? { amountMinor: incentiveResult.incentiveMinor.toString(), status: incentiveResult.status }
        : null,
    };
  }

  /**
   * Get full cycle status — re-evaluates the Tri-Condition gate on every call
   * (Condition 2 / Month-End is temporal and changes without deposits).
   */
  async getCycleStatus(cycleRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const cycle = await this.prisma.savingsCycle.findUnique({
      where: { cycleRef },
      include: { incentives: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    if (!cycle) throw new BadRequestException("Savings cycle not found");

    // Re-evaluate gate (catches month-end unlock that happened without a deposit)
    const now     = new Date();
    const freshGate = this.evaluateGate(cycle.daysSaved, now, cycle.withdrawalGateStatus);
    if (freshGate !== cycle.withdrawalGateStatus) {
      const freshStatus = freshGate === GATE_OPEN_MONTH_END ? CYCLE_MATURED_MONTH_END : cycle.status;
      await this.prisma.savingsCycle.update({
        where: { id: cycle.id },
        data: {
          withdrawalGateStatus: freshGate,
          status:               freshStatus,
          maturityUnlockedAt:   now,
        },
      });
    }

    const effectiveGate   = freshGate;
    const remainingDays   = Math.max(0, FULL_CYCLE_DAYS - cycle.daysSaved);
    const monthEndUnlocks = SavingsCycleService.isLastDayOfMonth(now);

    return {
      cycleRef,
      status:               freshGate !== cycle.withdrawalGateStatus
                              ? (freshGate === GATE_OPEN_MONTH_END ? CYCLE_MATURED_MONTH_END : cycle.status)
                              : cycle.status,
      withdrawalGateStatus: effectiveGate,
      withdrawalEnabled:    effectiveGate !== GATE_LOCKED,
      daysSaved:            cycle.daysSaved,
      remainingDays,
      totalSavedMinor:      cycle.totalSavedMinor.toFixed(0),
      agentLiquidityMinor:  cycle.agentLiquidityMinor.toFixed(0),
      dailyIncentiveMinor:  ((BigInt(cycle.agentLiquidityMinor.toFixed(0)) * 2n) / 100n).toString(),
      penaltyEventId:       cycle.penaltyEventId ?? null,
      startDate:            cycle.startDate,
      maturityUnlockedAt:   cycle.maturityUnlockedAt,
      conditions: {
        fullCycleMet:  cycle.daysSaved >= FULL_CYCLE_DAYS,
        monthEndMet:   monthEndUnlocks,
        emergencyOpen: cycle.withdrawalGateStatus === "OPEN_EMERGENCY",
      },
      recentIncentives: cycle.incentives.map((i) => ({
        dayNumber:   i.dayNumber,
        amountMinor: i.incentiveAmountMinor.toFixed(0),
        status:      i.status,
        settledAt:   i.settledAt,
      })),
    };
  }

  /**
   * Pure server-side gate evaluation — cannot be influenced by client input.
   *
   * Priority: OPEN_EMERGENCY (already set by break-safe) > OPEN_FULL_CYCLE > OPEN_MONTH_END > current
   */
  evaluateGate(daysSaved: number, now: Date, currentGate: string): string {
    if (currentGate === "OPEN_EMERGENCY") return "OPEN_EMERGENCY"; // irreversible
    if (daysSaved >= FULL_CYCLE_DAYS)     return GATE_OPEN_FULL_CYCLE;
    if (SavingsCycleService.isLastDayOfMonth(now)) return GATE_OPEN_MONTH_END;
    return currentGate === GATE_OPEN_FULL_CYCLE || currentGate === GATE_OPEN_MONTH_END
      ? currentGate   // keep previously unlocked state
      : GATE_LOCKED;
  }
}

