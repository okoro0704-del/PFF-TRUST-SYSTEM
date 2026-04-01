import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  AJO_ACTIVE, AJO_BROKEN, AJO_DAY1_FEE_MINOR, AJO_SAFE_BREAK_PCT,
  FEE_COLLECTED, FEE_PENDING, FLAG_AJO_BREAK, SEV_MEDIUM,
} from "./rscc.constants";

const fmt   = (minor: bigint) =>
  `₦${(Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
const mask  = (bvn: string) => `***${bvn.slice(-4)}`;

const AJO_SEED = [
  { name:"Adaeze Nwosu",       bank:"GTBank",   code:"058063220", day:14, fee:FEE_COLLECTED, target:2_000_000n, bal:933_000n,   status:AJO_ACTIVE },
  { name:"Emeka Okafor",       bank:"Access",   code:"044150149", day:7,  fee:FEE_COLLECTED, target:1_000_000n, bal:225_000n,   status:AJO_ACTIVE },
  { name:"Fatima Musa",        bank:"GTBank",   code:"058063220", day:21, fee:FEE_COLLECTED, target:3_000_000n, bal:2_032_000n, status:AJO_ACTIVE },
  { name:"Chidi Eze",          bank:"FirstBank",code:"011151012", day:3,  fee:FEE_COLLECTED, target:500_000n,   bal:48_000n,    status:AJO_ACTIVE },
  { name:"Ngozi Adeleke",      bank:"Zenith",   code:"057080004", day:28, fee:FEE_COLLECTED, target:5_000_000n, bal:4_516_000n, status:AJO_ACTIVE },
  { name:"Babatunde Ibrahim",  bank:"GTBank",   code:"058063220", day:1,  fee:FEE_PENDING,   target:1_500_000n, bal:0n,         status:AJO_ACTIVE },
  { name:"Aisha Bello",        bank:"Access",   code:"044150149", day:19, fee:FEE_COLLECTED, target:2_500_000n, bal:1_531_000n, status:AJO_ACTIVE },
  { name:"Oluwaseun Adeyemi",  bank:"GTBank",   code:"058063220", day:5,  fee:FEE_PENDING,   target:800_000n,   bal:0n,         status:AJO_ACTIVE },
  { name:"Uchenna Obiora",     bank:"Zenith",   code:"057080004", day:12, fee:FEE_COLLECTED, target:1_200_000n, bal:463_000n,   status:AJO_ACTIVE },
  { name:"Blessing Akintola",  bank:"FirstBank",code:"011151012", day:25, fee:FEE_COLLECTED, target:4_000_000n, bal:3_225_000n, status:AJO_ACTIVE },
  { name:"Kelechi Onwudiwe",   bank:"GTBank",   code:"058063220", day:31, fee:FEE_COLLECTED, target:2_000_000n, bal:0n,         status:AJO_BROKEN }, // safe break
  { name:"Suleiman Garba",     bank:"Access",   code:"044150149", day:9,  fee:FEE_PENDING,   target:600_000n,   bal:0n,         status:AJO_ACTIVE },
  { name:"Chiamaka Obi",       bank:"Zenith",   code:"057080004", day:16, fee:FEE_COLLECTED, target:3_500_000n, bal:1_812_000n, status:AJO_ACTIVE },
  { name:"Tunde Fashola",      bank:"GTBank",   code:"058063220", day:2,  fee:FEE_PENDING,   target:1_000_000n, bal:0n,         status:AJO_ACTIVE },
  { name:"Miriam Okonkwo",     bank:"FirstBank",code:"011151012", day:22, fee:FEE_COLLECTED, target:2_800_000n, bal:1_994_000n, status:AJO_ACTIVE },
] as const;

@Injectable()
export class RsccAjoService implements OnModuleInit {
  private readonly log = new Logger(RsccAjoService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() { await this.seedAjoAccounts(); }

  private async seedAjoAccounts() {
    try {
      const count = await this.prisma.ajoAccount.count();
      if (count > 0) return;
      const now = Date.now();

      for (const s of AJO_SEED) {
        const cycleStart  = new Date(now - s.day * 86_400_000);
        const collectedAt = s.fee === FEE_COLLECTED ? new Date(cycleStart.getTime() + 3_600_000) : null;
        const penalty     = s.status === AJO_BROKEN
          ? BigInt(Math.round(Number(s.target) * AJO_SAFE_BREAK_PCT / 100))
          : null;

        const acct = await this.prisma.ajoAccount.create({
          data: {
            accountRef: `AJO-${randomUUID().slice(0, 8).toUpperCase()}`,
            holderName: s.name, holderBvnMasked: mask(String(Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000))),
            bankCode: s.code, bankName: s.bank,
            cycleStartDate: cycleStart, status: s.status,
            day1FeeMinor: AJO_DAY1_FEE_MINOR, day1FeeStatus: s.fee,
            day1FeeCollectedAt: collectedAt,
            targetAmountMinor: s.target, currentBalanceMinor: s.bal,
            safeBreakPenaltyMinor: penalty,
          },
        });

        if (s.status === AJO_BROKEN) {
          await this.prisma.adminRedFlag.create({
            data: {
              flagType: FLAG_AJO_BREAK, severity: SEV_MEDIUM,
              bankCode: s.code, bankName: s.bank,
              message: `Safe-break recorded for Ajo account ${acct.accountRef} (${s.name}). Penalty: ${fmt(penalty!)}. 50% of target ₦${fmt(s.target)} forfeited.`,
            },
          });
        }
      }
      this.log.log(`[RSCC] ${AJO_SEED.length} Ajo accounts seeded`);
    } catch (err) {
      this.log.warn(`[RSCC] Ajo seed skipped: ${String(err)}`);
    }
  }

  async listAccounts(orgId = "default", search?: string) {
    await this.prisma.setOrgContext(orgId);
    const where = search
      ? { OR: [{ holderName: { contains: search, mode: "insensitive" as const } }, { bankName: { contains: search, mode: "insensitive" as const } }, { accountRef: { contains: search, mode: "insensitive" as const } }] }
      : {};

    const accounts = await this.prisma.ajoAccount.findMany({ where, orderBy: { createdAt: "desc" } });
    return {
      count: accounts.length,
      accounts: accounts.map(a => {
        const day  = Math.min(a.cycleLengthDays, Math.ceil((Date.now() - a.cycleStartDate.getTime()) / 86_400_000));
        const pct  = Math.round((day / a.cycleLengthDays) * 100);
        return {
          ...a, currentDay: day, progressPct: pct,
          progressLabel: `Day ${day}/${a.cycleLengthDays}`,
          day1FeeDisplay: fmt(a.day1FeeMinor),
          targetDisplay: fmt(a.targetAmountMinor),
          balanceDisplay: fmt(a.currentBalanceMinor),
          penaltyDisplay: a.safeBreakPenaltyMinor ? fmt(a.safeBreakPenaltyMinor) : null,
        };
      }),
    };
  }

  async getSummary(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const all = await this.prisma.ajoAccount.findMany();
    const collected = all.filter(a => a.day1FeeStatus === FEE_COLLECTED);
    const active    = all.filter(a => a.status === AJO_ACTIVE);
    const broken    = all.filter(a => a.status === AJO_BROKEN);
    const totalDay1 = collected.reduce((s, a) => s + a.day1FeeMinor, 0n);
    const totalTvl  = all.reduce((s, a) => s + a.currentBalanceMinor, 0n);
    const pendingCount = all.filter(a => a.day1FeeStatus === "PENDING").length;

    return {
      totalSavers: all.length, activeSavers: active.length,
      safeBreaks: broken.length, pendingDay1Fees: pendingCount,
      totalDay1FeesCollectedFmt: fmt(totalDay1),
      totalTvlFmt: fmt(totalTvl),
      projectedMonthEndFmt: fmt(totalDay1 * 31n / BigInt(Math.max(1, collected.length))),
    };
  }

  async exportCsv(orgId = "default"): Promise<{ csv: string; filename: string }> {
    const { accounts } = await this.listAccounts(orgId);
    const header = "Account Ref,Holder,Bank,Cycle Day,Total Days,Day-1 Status,Day-1 Fee,Balance,Status,Start Date";
    const rows   = accounts.map(a =>
      `"${a.accountRef}","${a.holderName}","${a.bankName}",${a.currentDay},${a.cycleLengthDays},"${a.day1FeeStatus}","${a.day1FeeDisplay}","${a.balanceDisplay}","${a.status}","${a.cycleStartDate.toISOString().split("T")[0]}"`
    );
    return { csv: [header, ...rows].join("\n"), filename: `fman-ajo-${new Date().toISOString().split("T")[0]}.csv` };
  }
}

