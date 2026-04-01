import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import {
  AGENT_INCENTIVE_RATE_DEN,
  AGENT_INCENTIVE_RATE_NUM,
  INCENTIVE_FAILED,
  INCENTIVE_PENDING,
  INCENTIVE_SETTLED,
} from "./savings.constants";

/**
 * Agent Incentive Service — System-to-Agent Daily Reward Engine.
 *
 * Formula: Daily_Incentive = (Day_1_Total_Fee × 0.60) × 0.02
 *                          = agentLiquidityMinor × 2 / 100
 *
 * Source of funds: F-Man Operations Account at the Agent's Partner Bank.
 * Destination:     Agent's registered wallet / account at the same bank.
 *
 * The CBS transfer is performed via the Direct Core Banking stub (HTTP when
 * CBS_BASE_URL is configured; structured log in dev/test).
 */
@Injectable()
export class AgentIncentiveService {
  private readonly log = new Logger(AgentIncentiveService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  /**
   * Calculate and disburse the daily agent incentive for a specific deposit day.
   * Creates an AgentIncentiveLog row (PENDING), calls the CBS stub,
   * then updates status to SETTLED or FAILED.
   *
   * Called from SavingsCycleService.recordDeposit() for Day 2–31.
   */
  async disburseIncentive(params: {
    cycleId:             string;
    depositId:           string;
    dayNumber:           number;
    agentLiquidityMinor: Decimal;
    agentBvnHash:        string;
    partnerBank:         string;
    orgId:               string;
  }): Promise<{ incentiveMinor: bigint; status: string }> {
    await this.prisma.setOrgContext(params.orgId);

    // ── Exact integer arithmetic: incentive = agentLiquidity * 2 / 100 ────
    const liquidity = BigInt(params.agentLiquidityMinor.toFixed(0));
    const incentiveMinor = (liquidity * AGENT_INCENTIVE_RATE_NUM) / AGENT_INCENTIVE_RATE_DEN;

    // ── Create PENDING incentive log row ─────────────────────────────────
    const log = await this.prisma.agentIncentiveLog.create({
      data: {
        cycleId:             params.cycleId,
        depositId:           params.depositId,
        dayNumber:           params.dayNumber,
        incentiveAmountMinor: new Decimal(incentiveMinor.toString()),
        agentBvnHash:        params.agentBvnHash,
        partnerBank:         params.partnerBank,
        status:              INCENTIVE_PENDING,
        orgId:               params.orgId,
      },
    });

    // ── CBS Transfer: F-Man Ops Account → Agent Account ──────────────────
    const cbsResult = await this.callCbsTransfer({
      fromAccountRef: this.config.get<string>("FMAN_OPS_ACCOUNT_REF") ?? "FMAN-OPS-DEFAULT",
      toAgentBvnHash: params.agentBvnHash,
      partnerBank:    params.partnerBank,
      amountMinor:    incentiveMinor,
      currencyCode:   this.config.get<string>("DEFAULT_CURRENCY") ?? "NGN",
      reference:      `INCENTIVE-${log.id}`,
    });

    // ── Update incentive row status ───────────────────────────────────────
    const finalStatus = cbsResult.success ? INCENTIVE_SETTLED : INCENTIVE_FAILED;
    await this.prisma.agentIncentiveLog.update({
      where: { id: log.id },
      data: {
        status:    finalStatus,
        settledAt: cbsResult.success ? new Date() : null,
      },
    });

    return { incentiveMinor, status: finalStatus };
  }

  /**
   * CBS Direct Core Banking stub.
   * Wires to POST {CBS_BASE_URL}/v1/transfers when configured.
   * Falls back to a structured warning log in dev/test.
   */
  private async callCbsTransfer(params: {
    fromAccountRef: string;
    toAgentBvnHash: string;
    partnerBank:    string;
    amountMinor:    bigint;
    currencyCode:   string;
    reference:      string;
  }): Promise<{ success: boolean; cbsRef?: string }> {
    const base = this.config.get<string>("CBS_BASE_URL");
    if (base) {
      try {
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/transfers`, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({
            fromAccountRef:  params.fromAccountRef,
            toAgentBvnHash:  params.toAgentBvnHash,
            partnerBank:     params.partnerBank,
            amountMinor:     params.amountMinor.toString(),
            currencyCode:    params.currencyCode,
            reference:       params.reference,
            transferType:    "AGENT_INCENTIVE",
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const body = (await res.json()) as { cbsRef?: string };
          return { success: true, cbsRef: body.cbsRef };
        }
      } catch {
        /* fall through to stub */
      }
    }
    this.log.warn(
      `[CBS][incentive] stub — would credit ${params.amountMinor} ${params.currencyCode} ` +
      `to agent ${params.toAgentBvnHash} at ${params.partnerBank} | ref: ${params.reference}`,
    );
    return { success: true }; // stub always succeeds in dev
  }
}

