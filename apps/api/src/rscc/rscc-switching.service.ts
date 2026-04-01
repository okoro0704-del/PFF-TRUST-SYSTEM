import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  DEMO_LICENSES, NIGERIAN_LGAS, NIGERIAN_STATES,
  SESSION_BIH, SESSION_BLIDE, SESSION_BLS,
  TOLL_BILL_FEE_MINOR, TOLL_BILL_PAYMENT, TOLL_NIBSS_YES,
  TOLL_TRANSFER, TOLL_TRANSFER_MAX, TOLL_TRANSFER_MIN, TOLL_TRANSFER_PCT,
  TOLL_WITHDRAWAL, TOLL_WITHDRAWAL_MAX, TOLL_WITHDRAWAL_MIN, TOLL_WITHDRAWAL_PCT,
  TOLL_YES_FEE_MINOR,
} from "./rscc.constants";
import type { SwitchingFilterDto } from "./dto/switching-filter.dto";

const PAGE_SIZE = 25;
const fmt = (minor: bigint) =>
  `₦${(Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

function computeTransferFee(amount: bigint): bigint {
  const fee = BigInt(Math.round(Number(amount) * TOLL_TRANSFER_PCT));
  return fee < TOLL_TRANSFER_MIN ? TOLL_TRANSFER_MIN : fee > TOLL_TRANSFER_MAX ? TOLL_TRANSFER_MAX : fee;
}
function computeWithdrawalFee(amount: bigint): bigint {
  const fee = BigInt(Math.round(Number(amount) * TOLL_WITHDRAWAL_PCT));
  return fee < TOLL_WITHDRAWAL_MIN ? TOLL_WITHDRAWAL_MIN : fee > TOLL_WITHDRAWAL_MAX ? TOLL_WITHDRAWAL_MAX : fee;
}

// Distribution weights for seeding
const TOLL_WEIGHTS = [
  { type: TOLL_NIBSS_YES, session: SESSION_BIH,   weight: 20 },
  { type: TOLL_NIBSS_YES, session: SESSION_BLIDE,  weight: 20 },
  { type: TOLL_TRANSFER,  session: SESSION_BLIDE,  weight: 25 },
  { type: TOLL_BILL_PAYMENT, session: SESSION_BLIDE, weight: 20 },
  { type: TOLL_WITHDRAWAL,session: SESSION_BLS,    weight: 15 },
];

@Injectable()
export class RsccSwitchingService implements OnModuleInit {
  private readonly log = new Logger(RsccSwitchingService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.seedTolls(); }

  private async seedTolls() {
    try {
      const count = await this.prisma.switchingToll.count();
      if (count > 0) return;

      const banks   = [...DEMO_LICENSES];
      const states  = [...NIGERIAN_STATES];
      const now     = Date.now();
      const records = [];

      for (let i = 0; i < 55; i++) {
        const daysAgo    = Math.floor(Math.random() * 30);
        const hoursAgo   = Math.floor(Math.random() * 24);
        const createdAt  = new Date(now - daysAgo * 86_400_000 - hoursAgo * 3_600_000);

        // Weighted random toll type
        const roll       = Math.floor(Math.random() * 100);
        let cumul = 0;
        let entry = TOLL_WEIGHTS[0];
        for (const w of TOLL_WEIGHTS) { cumul += w.weight; if (roll < cumul) { entry = w; break; } }

        const bank     = banks[Math.floor(Math.random() * banks.length)];
        const state    = states[Math.floor(Math.random() * states.length)];
        const lgas     = NIGERIAN_LGAS[state] ?? NIGERIAN_LGAS.default;
        const lga      = lgas[Math.floor(Math.random() * lgas.length)];
        const tenMRule = Math.random() < 0.23;

        let feeMinor: bigint, amountMinor: bigint | null = null;
        if (entry.type === TOLL_NIBSS_YES)    { feeMinor = TOLL_YES_FEE_MINOR; }
        else if (entry.type === TOLL_BILL_PAYMENT) { feeMinor = TOLL_BILL_FEE_MINOR; }
        else if (entry.type === TOLL_TRANSFER) {
          amountMinor = BigInt(Math.floor(Math.random() * 50_000_000) + 5_000_000); // ₦500–₦5M
          feeMinor    = computeTransferFee(amountMinor);
        } else {
          amountMinor = BigInt(Math.floor(Math.random() * 20_000_000) + 5_000_000); // ₦500–₦2M
          feeMinor    = computeWithdrawalFee(amountMinor);
        }

        records.push({
          sessionRef: `DEMO-${entry.session}-${randomUUID().slice(0, 8)}`,
          sessionType: entry.session, tollType: entry.type,
          feeMinor, amountMinor,
          bankCode: bank.code, bankName: bank.name,
          agentId: `AGT-${String(i + 1).padStart(4, "0")}`,
          agentState: state, agentLga: lga,
          tenMRuleApplied: tenMRule,
          createdAt,
        });
      }

      await this.prisma.switchingToll.createMany({ data: records });
      this.log.log(`[RSCC] ${records.length} switching tolls seeded`);
    } catch (err) {
      this.log.warn(`[RSCC] Switching seed skipped: ${String(err)}`);
    }
  }

  async getSummary(orgId = "default", filter?: Partial<SwitchingFilterDto>) {
    await this.prisma.setOrgContext(orgId);
    const where = this.buildWhere(filter);
    const tolls  = await this.prisma.switchingToll.findMany({ where });

    const totalCalls     = tolls.length;
    const totalFees      = tolls.reduce((s, t) => s + t.feeMinor, 0n);
    const byType         = {} as Record<string, { count: number; fees: bigint }>;
    const today          = new Date(); today.setHours(0, 0, 0, 0);
    let todayCount = 0;

    for (const t of tolls) {
      byType[t.tollType] ??= { count: 0, fees: 0n };
      byType[t.tollType].count++;
      byType[t.tollType].fees += t.feeMinor;
      if (t.createdAt >= today) todayCount++;
    }

    const heatmap = Array<number>(24).fill(0);
    const last24h = new Date(Date.now() - 86_400_000);
    tolls.filter(t => t.createdAt >= last24h).forEach(t => heatmap[t.createdAt.getHours()]++);

    return {
      totalCalls, totalFeesFmt: fmt(totalFees), todayCount,
      byType: Object.fromEntries(
        Object.entries(byType).map(([k, v]) => [k, { count: v.count, feesFmt: fmt(v.fees) }])
      ),
      heatmap24h: heatmap,
    };
  }

  async listTolls(orgId = "default", filter?: Partial<SwitchingFilterDto>) {
    await this.prisma.setOrgContext(orgId);
    const page   = Math.max(1, filter?.page ?? 1);
    const where  = this.buildWhere(filter);
    const [items, total] = await Promise.all([
      this.prisma.switchingToll.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      this.prisma.switchingToll.count({ where }),
    ]);
    return { page, pageSize: PAGE_SIZE, total, items: items.map(t => ({ ...t, feeFmt: fmt(t.feeMinor) })) };
  }

  private buildWhere(filter?: Partial<SwitchingFilterDto>) {
    const w: Record<string, unknown> = {};
    if (filter?.tollType    && filter.tollType    !== "ALL") w.tollType    = filter.tollType;
    if (filter?.sessionType && filter.sessionType !== "ALL") w.sessionType = filter.sessionType;
    if (filter?.bankCode)    w.bankCode    = filter.bankCode;
    if (filter?.agentState)  w.agentState  = filter.agentState;
    if (filter?.agentLga)    w.agentLga    = filter.agentLga;
    return w;
  }

  async exportCsv(orgId = "default"): Promise<{ csv: string; filename: string }> {
    const { items } = await this.listTolls(orgId, { page: 1 });
    const header = "Session Ref,Session Type,Toll Type,Fee,Bank,Agent State,Agent LGA,10m Rule,Date";
    const rows   = items.map(t =>
      `"${t.sessionRef}","${t.sessionType}","${t.tollType}","${t.feeFmt}","${t.bankName ?? ""}","${t.agentState ?? ""}","${t.agentLga ?? ""}",${t.tenMRuleApplied},"${t.createdAt.toISOString().split("T")[0]}"`
    );
    return { csv: [header, ...rows].join("\n"), filename: `fman-switching-${new Date().toISOString().split("T")[0]}.csv` };
  }
}

