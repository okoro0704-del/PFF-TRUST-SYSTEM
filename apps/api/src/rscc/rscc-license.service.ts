import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "node:crypto";
import {
  DEMO_LICENSES, FLAG_LIC_EXPIRING, FLAG_LOW_BALANCE, LIC_ACTIVE,
  LIC_DURATION_DAYS, LIC_EXPIRY_WARN_DAYS, LIC_RENEWAL_FEE_MINOR,
  LIC_SUSPENDED, LIC_EXPIRING_SOON, SEV_CRITICAL, SEV_HIGH,
} from "./rscc.constants";
import type { ConfirmRenewalDto } from "./dto/confirm-renewal.dto";

const fmt = (minor: bigint) =>
  `₦${(Number(minor) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

function computeStatus(endDate: Date): string {
  const days = Math.ceil((endDate.getTime() - Date.now()) / 86_400_000);
  if (days > LIC_EXPIRY_WARN_DAYS) return LIC_ACTIVE;
  if (days > 0)                     return LIC_EXPIRING_SOON;
  return LIC_SUSPENDED;
}

@Injectable()
export class RsccLicenseService implements OnModuleInit {
  private readonly log = new Logger(RsccLicenseService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedLicenses();
  }

  private async seedLicenses() {
    try {
      const count = await this.prisma.bankLicense.count();
      if (count > 0) return;

      // Find existing bank applications (seeded by CasdBankPipelineService)
      const apps = await this.prisma.bankApplication.findMany();
      if (apps.length === 0) { this.log.warn("[RSCC] No bank apps found — license seed deferred"); return; }

      const now = Date.now();
      for (const demo of DEMO_LICENSES) {
        const app = apps.find(a => a.bankCode === demo.code);
        if (!app) continue;

        const startDate = new Date(now - demo.daysAgo * 86_400_000);
        const endDate   = new Date(startDate.getTime() + LIC_DURATION_DAYS * 86_400_000);
        const status    = computeStatus(endDate);
        const restricted = status === LIC_SUSPENDED;

        await this.prisma.bankLicense.create({
          data: {
            bankApplicationId: app.id, bankName: demo.name, bankCode: demo.code,
            licenseKey: `LIC-${demo.code.slice(-6)}-${randomUUID().slice(0, 8).toUpperCase()}`,
            renewalFeeMinor: LIC_RENEWAL_FEE_MINOR,
            licenseStartDate: startDate, licenseEndDate: endDate,
            status, apiAccessRestricted: restricted,
            dedicatedAcctBalance: demo.balance,
          },
        });

        // Seed DedicatedAccountBalance
        const avgDailyPayout = 15_000_000n; // ₦150,000 stub average
        const projected48h   = avgDailyPayout * 2n;
        const redFlag = demo.balance < projected48h;
        await this.prisma.dedicatedAccountBalance.upsert({
          where: { bankApplicationId: app.id },
          update: {},
          create: {
            bankApplicationId: app.id, bankName: demo.name, bankCode: demo.code,
            balanceMinor: demo.balance, projectedPayout48hMinor: projected48h,
            redFlagTriggered: redFlag,
            redFlagTriggeredAt: redFlag ? new Date() : null,
            lastReconciledAt: new Date(),
          },
        });

        if (redFlag) {
          await this.prisma.adminRedFlag.create({
            data: {
              flagType: FLAG_LOW_BALANCE, severity: SEV_CRITICAL,
              bankCode: demo.code, bankName: demo.name,
              message: `Dedicated account for ${demo.name} holds ${fmt(demo.balance)} — below 48h payout projection of ${fmt(projected48h)}. Immediate top-up required.`,
            },
          });
        }
        if (status === LIC_EXPIRING_SOON || status === LIC_SUSPENDED) {
          await this.prisma.adminRedFlag.create({
            data: {
              flagType: FLAG_LIC_EXPIRING,
              severity: status === LIC_SUSPENDED ? SEV_CRITICAL : SEV_HIGH,
              bankCode: demo.code, bankName: demo.name,
              message: status === LIC_SUSPENDED
                ? `${demo.name} license SUSPENDED — API access restricted. Renewal fee ₦500,000 required.`
                : `${demo.name} license expires in < ${LIC_EXPIRY_WARN_DAYS} days. Schedule renewal.`,
            },
          });
        }
      }
      this.log.log("[RSCC] Licenses + dedicated accounts seeded");
    } catch (err) {
      this.log.warn(`[RSCC] License seed skipped: ${String(err)}`);
    }
  }

  async listLicenses(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const licenses = await this.prisma.bankLicense.findMany({ orderBy: { licenseEndDate: "asc" } });

    // Auto-update stale statuses
    const updates: Promise<unknown>[] = [];
    const enriched = licenses.map(lic => {
      const computed  = computeStatus(lic.licenseEndDate);
      const daysLeft  = Math.max(0, Math.ceil((lic.licenseEndDate.getTime() - Date.now()) / 86_400_000));
      const daysElapsed = Math.max(0, LIC_DURATION_DAYS - daysLeft);
      const barPct    = Math.round((daysLeft / LIC_DURATION_DAYS) * 100);

      if (computed !== lic.status) {
        updates.push(this.prisma.bankLicense.update({
          where: { id: lic.id },
          data: { status: computed, apiAccessRestricted: computed === LIC_SUSPENDED, lastStatusCheckAt: new Date() },
        }));
      }
      return {
        ...lic, daysRemaining: daysLeft, daysElapsed, barPct,
        status: computed,
        renewalFeeFmt: fmt(lic.renewalFeeMinor),
        dedicatedBalanceFmt: fmt(lic.dedicatedAcctBalance),
        licenseEndDateFmt: lic.licenseEndDate.toISOString().split("T")[0],
      };
    });

    await Promise.all(updates);

    const stats = {
      active:       enriched.filter(l => l.status === LIC_ACTIVE).length,
      expiringSoon: enriched.filter(l => l.status === LIC_EXPIRING_SOON).length,
      suspended:    enriched.filter(l => l.status === LIC_SUSPENDED).length,
      totalRevenue: fmt(enriched.reduce((s, l) => s + l.renewalFeeMinor, 0n)),
    };
    return { stats, licenses: enriched };
  }

  async confirmRenewal(id: string, dto: ConfirmRenewalDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);
    const lic = await this.prisma.bankLicense.findUnique({ where: { id } });
    if (!lic) throw new Error("License not found");

    const now     = new Date();
    const newEnd  = new Date(now.getTime() + LIC_DURATION_DAYS * 86_400_000);
    const updated = await this.prisma.bankLicense.update({
      where: { id },
      data: {
        status: LIC_ACTIVE, apiAccessRestricted: false,
        licenseStartDate: now, licenseEndDate: newEnd,
        renewalConfirmedAt: now, renewalConfirmedBy: dto.confirmedBy ?? "admin",
        lastStatusCheckAt: now,
      },
    });
    // Resolve any LICENSE_EXPIRING flags for this bank
    await this.prisma.adminRedFlag.updateMany({
      where: { bankCode: lic.bankCode ?? "", flagType: FLAG_LIC_EXPIRING, isResolved: false },
      data:  { isResolved: true, resolvedAt: now, resolvedBy: dto.confirmedBy ?? "system" },
    });
    return { message: "License renewed. API access restored.", license: updated, newExpiryDate: newEnd.toISOString().split("T")[0] };
  }

  async exportCsv(orgId = "default"): Promise<{ csv: string; filename: string }> {
    const { licenses } = await this.listLicenses(orgId);
    const header = "Bank Name,Bank Code,License Key,Status,Days Remaining,End Date,Renewal Fee,Dedicated Account Balance,API Restricted";
    const rows = licenses.map(l =>
      `"${l.bankName}","${l.bankCode ?? ""}","${l.licenseKey}","${l.status}",${l.daysRemaining},"${l.licenseEndDateFmt}","${l.renewalFeeFmt}","${l.dedicatedBalanceFmt}",${l.apiAccessRestricted}`
    );
    return { csv: [header, ...rows].join("\n"), filename: `fman-licenses-${new Date().toISOString().split("T")[0]}.csv` };
  }
}

