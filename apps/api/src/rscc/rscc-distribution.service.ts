import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AJO_DAY1_FEE_MINOR, DAILY_REWARD_PCT, DIST_DISBURSED, DIST_PENDING,
  FLAG_LOW_BALANCE, SEV_CRITICAL, SPLIT_AGENT_PCT, SPLIT_FMAN_PCT,
  TOTAL_ELIGIBLE_AGENTS,
} from "./rscc.constants";

const fmt = (minor: bigint) =>
  `₦${(Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

@Injectable()
export class RsccDistributionService implements OnModuleInit {
  private readonly log = new Logger(RsccDistributionService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.seedDistributions(); }

  private async seedDistributions() {
    try {
      const count = await this.prisma.agentLiquidityDistribution.count();
      if (count > 0) return;

      const ajoCount = await this.prisma.ajoAccount.count({ where: { day1FeeStatus: "COLLECTED" } });
      // Base each day's total on collected Ajo Day-1 fees (some variation per day)
      for (let dayAgo = 6; dayAgo >= 0; dayAgo--) {
        const date  = new Date(); date.setDate(date.getDate() - dayAgo); date.setHours(0, 0, 0, 0);
        const count = Math.max(1, ajoCount + Math.floor((Math.random() - 0.5) * 4));
        const total = AJO_DAY1_FEE_MINOR * BigInt(count);
        const fman  = total * BigInt(SPLIT_FMAN_PCT) / 100n;
        const pool  = total - fman;
        const two   = pool * BigInt(DAILY_REWARD_PCT) / 100n;
        const rpa   = two / BigInt(TOTAL_ELIGIBLE_AGENTS);
        const isPending = dayAgo <= 1;
        const disbursed = !isPending ? new Date(date.getTime() + 16 * 3_600_000) : null;

        await this.prisma.agentLiquidityDistribution.create({
          data: {
            distributionDate: date, totalDay1FeesMinor: total,
            fmanShareMinor: fman, agentPoolMinor: pool,
            twoPercentPoolMinor: two, rewardPerAgentMinor: rpa,
            totalAgentsEligible: TOTAL_ELIGIBLE_AGENTS,
            status: isPending ? DIST_PENDING : DIST_DISBURSED,
            disbursedAt: disbursed,
          },
        });
      }
      this.log.log("[RSCC] 7-day distribution history seeded");
    } catch (err) {
      this.log.warn(`[RSCC] Distribution seed skipped: ${String(err)}`);
    }
  }

  async getDailySplit(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dist  = await this.prisma.agentLiquidityDistribution.findFirst({
      where: { distributionDate: { gte: today } }, orderBy: { distributionDate: "desc" },
    });
    if (!dist) return null;
    return {
      date: dist.distributionDate.toISOString().split("T")[0],
      totalDay1FeesFmt: fmt(dist.totalDay1FeesMinor),
      fmanShareFmt:     fmt(dist.fmanShareMinor),
      agentPoolFmt:     fmt(dist.agentPoolMinor),
      twoPercentFmt:    fmt(dist.twoPercentPoolMinor),
      rewardPerAgentFmt:fmt(dist.rewardPerAgentMinor),
      totalAgents:      dist.totalAgentsEligible,
      fmanPct:          SPLIT_FMAN_PCT, agentPct: SPLIT_AGENT_PCT,
      status:           dist.status, disbursedAt: dist.disbursedAt,
    };
  }

  async getDistributions(orgId = "default", days = 7) {
    await this.prisma.setOrgContext(orgId);
    const since = new Date(Date.now() - days * 86_400_000);
    const rows  = await this.prisma.agentLiquidityDistribution.findMany({
      where: { distributionDate: { gte: since } }, orderBy: { distributionDate: "desc" },
    });
    return {
      count: rows.length,
      distributions: rows.map(r => ({
        ...r,
        totalDay1FeesFmt: fmt(r.totalDay1FeesMinor),
        fmanShareFmt:     fmt(r.fmanShareMinor),
        agentPoolFmt:     fmt(r.agentPoolMinor),
        twoPercentFmt:    fmt(r.twoPercentPoolMinor),
        rewardPerAgentFmt:fmt(r.rewardPerAgentMinor),
        dateFmt: r.distributionDate.toISOString().split("T")[0],
      })),
    };
  }

  async checkAndTriggerRedFlags(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const balances = await this.prisma.dedicatedAccountBalance.findMany({ where: { redFlagTriggered: false } });
    let triggered = 0;
    for (const b of balances) {
      if (b.balanceMinor < b.projectedPayout48hMinor) {
        await this.prisma.dedicatedAccountBalance.update({
          where: { id: b.id }, data: { redFlagTriggered: true, redFlagTriggeredAt: new Date(), updatedAt: new Date() },
        });
        await this.prisma.adminRedFlag.create({
          data: {
            flagType: FLAG_LOW_BALANCE, severity: SEV_CRITICAL,
            bankCode: b.bankCode ?? "", bankName: b.bankName,
            message: `⚠️ CRITICAL: ${b.bankName} dedicated account balance ${fmt(b.balanceMinor)} is below the 48h projected agent payout of ${fmt(b.projectedPayout48hMinor)}. Immediate top-up required to avoid commission disbursement failure.`,
            orgId,
          },
        });
        triggered++;
      }
    }
    return { flagsTriggered: triggered };
  }

  async getRedFlags(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const flags = await this.prisma.adminRedFlag.findMany({
      where: { isResolved: false }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    });
    return { count: flags.length, flags };
  }

  async resolveRedFlag(id: string, resolvedBy = "admin", orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const flag = await this.prisma.adminRedFlag.update({
      where: { id }, data: { isResolved: true, resolvedAt: new Date(), resolvedBy },
    });
    return { resolved: true, flag };
  }

  async exportCsv(orgId = "default"): Promise<{ csv: string; filename: string }> {
    const { distributions } = await this.getDistributions(orgId, 30);
    const header = "Date,Total Day-1 Fees,F-Man Share (40%),Agent Pool (60%),2% Pool,Per-Agent Reward,Agents,Status,Disbursed At";
    const rows   = distributions.map(d =>
      `"${d.dateFmt}","${d.totalDay1FeesFmt}","${d.fmanShareFmt}","${d.agentPoolFmt}","${d.twoPercentFmt}","${d.rewardPerAgentFmt}",${d.totalAgentsEligible},"${d.status}","${d.disbursedAt ? new Date(d.disbursedAt).toISOString() : ""}"`
    );
    return { csv: [header, ...rows].join("\n"), filename: `fman-distribution-${new Date().toISOString().split("T")[0]}.csv` };
  }
}

