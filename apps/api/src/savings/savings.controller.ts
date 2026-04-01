import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { SavingsCycleService } from "./savings-cycle.service";
import { WithdrawalGateService } from "./withdrawal-gate.service";
import { OpenCycleDto } from "./dto/open-cycle.dto";
import { DailyDepositDto } from "./dto/daily-deposit.dto";
import { BreakSafeDto } from "./dto/break-safe.dto";
import { WithdrawVaultDto } from "./dto/withdraw-vault.dto";

/**
 * LLIW — Liquidity-Linked Incentive & Withdrawal Gate API
 *
 * Withdrawal gate logic is ALWAYS evaluated server-side; clients can never
 * set the gate status directly.
 *
 * Tri-Condition Hard Lock:
 *   1. Full Cycle   — 31 days saved   → OPEN_FULL_CYCLE
 *   2. Month-End    — last calendar day → OPEN_MONTH_END
 *   3. Emergency    — "Break Safe"    → OPEN_EMERGENCY + 50% penalty
 */
@ApiTags("savings")
@Controller("v1/savings")
export class SavingsController {
  constructor(
    private readonly cycles:   SavingsCycleService,
    private readonly gate:     WithdrawalGateService,
  ) {}

  /**
   * Open a savings cycle (Day-1 First Payment).
   * Captures the Agent Liquidity stake (60% of Day-1 fee).
   * Returns cycleRef, gateStatus=LOCKED, and the pre-computed daily incentive amount.
   */
  @ApiOperation({ summary: "Open savings cycle — Day-1 First Payment, captures 60% Agent Liquidity stake" })
  @Post("cycles/open")
  openCycle(@Body() dto: OpenCycleDto) {
    return this.cycles.openCycle(dto);
  }

  /**
   * Record a daily customer deposit (Day 2–31).
   * Triggers the 2% Agent Incentive disbursement from the F-Man Ops Account.
   * Re-evaluates the Tri-Condition gate after each deposit.
   */
  @ApiOperation({
    summary: "Record daily deposit (Day 2–31) — triggers 2% Agent Incentive, re-evaluates withdrawal gate",
  })
  @Post("cycles/:cycleRef/deposit")
  recordDeposit(
    @Param("cycleRef") cycleRef: string,
    @Body() dto: DailyDepositDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.cycles.recordDeposit(cycleRef, dto, dto.orgId ?? orgId);
  }

  /**
   * Get cycle status with live gate evaluation.
   * Condition 2 (Month-End) is temporal — status updates even without a deposit.
   * The withdrawalEnabled flag reflects the current server-side gate state.
   */
  @ApiOperation({
    summary: "Get cycle status — re-evaluates all 3 gate conditions on every call (temporal safety)",
  })
  @Get("cycles/:cycleRef/status")
  cycleStatus(
    @Param("cycleRef") cycleRef: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.cycles.getCycleStatus(cycleRef, orgId);
  }

  /**
   * Emergency Break — Condition 3 (Costly Exit).
   *
   * Applies a 50% liquidation penalty on totalSavedToDate.
   * Penalty is routed to the System Account.
   * A unique Penalty_Event_ID is stamped for month-end reconciliation.
   * Requires biometric "Yes Call" handshake.
   *
   * This call ONLY unlocks the gate and records the penalty.
   * Funds are pushed via POST /withdraw (two-step for safety).
   */
  @ApiOperation({
    summary: "Emergency Break (Break Safe) — 50% penalty, stamps Penalty_Event_ID, unlocks OPEN_EMERGENCY gate",
  })
  @Post("cycles/:cycleRef/break-safe")
  breakSafe(
    @Param("cycleRef") cycleRef: string,
    @Body() dto: BreakSafeDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.gate.initiateBreakSafe(cycleRef, dto, dto.orgId ?? orgId);
  }

  /**
   * Execute Vault Withdrawal — the "Yes Call" Handshake.
   *
   * Only callable when withdrawalGateStatus ≠ LOCKED.
   * Biometric proof hash required (minted by POST /execution/mint-validation-hash).
   * Pushes net payout to customer's bank / mobile wallet via CBS.
   */
  @ApiOperation({
    summary: "Execute withdrawal — biometric Yes-Call required; CBS vault push to destination account",
  })
  @Post("cycles/:cycleRef/withdraw")
  withdraw(
    @Param("cycleRef") cycleRef: string,
    @Body() dto: WithdrawVaultDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.gate.executeWithdrawal(cycleRef, dto, dto.orgId ?? orgId);
  }

  /**
   * Agent incentive history — last N incentive disbursements for an agent BVN hash.
   */
  @ApiOperation({ summary: "Agent incentive history — list recent System-to-Agent incentive payouts" })
  @Get("agent/:agentBvnHash/incentives")
  agentIncentives(
    @Param("agentBvnHash") agentBvnHash: string,
    @Query("orgId") orgId = "default",
    @Query("take") take?: string,
  ) {
    return this.gate.getAgentIncentiveHistory(agentBvnHash, orgId, take ? parseInt(take, 10) : 50);
  }
}

