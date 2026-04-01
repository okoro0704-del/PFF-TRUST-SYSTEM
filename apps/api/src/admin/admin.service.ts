import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { BankabilityService } from "../unbanked/bankability.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly bankability:  BankabilityService,
  ) {}

  async logs(orgId: string, take = 100) {
    await this.prisma.setOrgContext(orgId);
    const rows = await this.prisma.verificationLedger.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take,
    });
    const success = rows.filter((r) => r.aggregateConfirmed).length;
    const failure = rows.length - success;
    return {
      total: rows.length,
      successRate: rows.length ? success / rows.length : 0,
      failureRate: rows.length ? failure / rows.length : 0,
      recent: rows,
    };
  }

  async sentinelAlerts(orgId: string, take = 50) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.verificationLedger.findMany({
      where: { orgId, mismatchAlert: true },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async liquidityMirror() {
    return this.prisma.liquiditySnapshot.findMany({
      orderBy: { capturedAt: "desc" },
      take: 200,
    });
  }

  /** Ingest from partner bank poller / treasury — placeholder for integration. */
  async ingestLiquidity(partnerBank: string, accountRef: string, balanceMinor: string, currencyCode: string) {
    return this.prisma.liquiditySnapshot.create({
      data: {
        partnerBank,
        accountRef,
        balanceMinor: new Prisma.Decimal(balanceMinor),
        currencyCode,
      },
    });
  }

  /** Headless monitoring: YES/NO style ratios from NIBSS ledger + execution + Pulse health. */
  async executionMetrics(orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const [vl, transferTotal, transferProv, pulsePending, accounts] = await Promise.all([
      this.prisma.verificationLedger.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 2000,
      }),
      this.prisma.ledgerTransfer.count({ where: { orgId } }),
      this.prisma.ledgerTransfer.count({
        where: { orgId, executionStatus: "PROVISIONAL_PENDING_SOVRYN" },
      }),
      this.prisma.pulseSyncQueue.count({ where: { status: "PENDING_SOVRYN" } }),
      this.prisma.ledgerAccount.count({ where: { orgId } }),
    ]);
    const confirmed = vl.filter((r) => r.aggregateConfirmed).length;
    const gateYes = (o: string) => o === "match_found";
    let nibssChannelYes = 0;
    let nibssChannelNo = 0;
    for (const r of vl) {
      for (const g of [r.fpOutcome, r.faceOutcome, r.mobileOutcome]) {
        if (gateYes(g)) nibssChannelYes++;
        else nibssChannelNo++;
      }
    }
    return {
      verificationLedger: {
        sampleSize: vl.length,
        transactionConfirmedRate: vl.length ? confirmed / vl.length : 0,
        /** Per-channel YES vs NO (fingerprint / face / mobile rows expanded) */
        nibssChannelYesRatio: nibssChannelYes + nibssChannelNo ? nibssChannelYes / (nibssChannelYes + nibssChannelNo) : 0,
      },
      executionLayer: {
        ledgerAccounts: accounts,
        ledgerTransfersTotal: transferTotal,
        provisionalTransfersPendingBatch: transferProv,
      },
      pulseSync: {
        pendingBatchSettlement: pulsePending,
      },
    };
  }

  async systemHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: "up", timestamp: new Date().toISOString() };
    } catch {
      return { database: "down", timestamp: new Date().toISOString() };
    }
  }

  /**
   * Unbanked Capture & Bankability metrics.
   * Returns profile counts by status, bankability rate, and the 20 most-recent NIBSS submissions.
   */
  async unbankedMetrics(orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const [total, unbanked, submitted, bankable, duplicateLinked, recentSubmissions, watchEyeEntries] =
      await Promise.all([
        this.prisma.unbankedProfile.count({ where: { orgId } }),
        this.prisma.unbankedProfile.count({ where: { orgId, status: "UNBANKED" } }),
        this.prisma.unbankedProfile.count({ where: { orgId, status: "NIBSS_SUBMITTED" } }),
        this.prisma.unbankedProfile.count({ where: { orgId, status: "BANKABLE" } }),
        this.prisma.unbankedProfile.count({ where: { orgId, status: "DUPLICATE_LINKED" } }),
        this.prisma.nibssSubmission.findMany({
          where:   { orgId },
          orderBy: { createdAt: "desc" },
          take:    20,
          include: { profile: { select: { tfanId: true, status: true, shardCountry: true } } },
        }),
        this.prisma.watchEyeSupplementalLog.count({ where: { orgId } }),
      ]);

    return {
      profiles: { total, unbanked, submitted, bankable, duplicateLinked },
      bankabilityRate: total ? +(bankable / total).toFixed(4) : 0,
      watchEye: { supplementalLogEntries: watchEyeEntries },
      recentNibssSubmissions: recentSubmissions.map((s) => ({
        enrollmentId:  s.enrollmentId,
        nibssStatus:   s.nibssStatus,
        tfanId:        s.profile.tfanId,
        profileStatus: s.profile.status,
        shardCountry:  s.profile.shardCountry,
        submittedAt:   s.submissionTimestamp,
        hasResponse:   !!s.nibssResponsePayload,
      })),
    };
  }

  /** Second Watch audit: ledger rows resolved via Watch Eye when NIBSS portal was down. */
  async watchEyePrimaryEvents(orgId: string, take = 50) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.verificationLedger.findMany({
      where:   { orgId, policyMode: { contains: "watch_eye_primary" } },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /**
   * Admin-forced bankability upgrade — POST /v1/admin/unbanked/:tfanId/force-bankability
   *
   * Use when the NIBSS callback was dropped (network error, webhook failure) and the
   * operator has confirmed the BVN via an out-of-band channel.
   * Creates an audit NibssSubmission record tagged ADMIN-FORCED for traceability.
   */
  async forceBankability(tfanId: string, bvn: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);

    const profile = await this.prisma.unbankedProfile.findUnique({ where: { tfanId } });
    if (!profile) throw new BadRequestException("TFAN not found");
    if (profile.status === "BANKABLE") {
      return { tfanId, status: "BANKABLE", message: "Already bankable — no action taken" };
    }

    const result = await this.bankability.upgradeToGlobal({ tfanId, bvn, orgId });

    // Append admin-action audit row to nibss_submission log
    await this.prisma.nibssSubmission.create({
      data: {
        profileId:           profile.id,
        enrollmentId:        `ADMIN-FORCE-${randomUUID()}`,
        nibssStatus:         "SUCCESS",
        assignedBvn:         "[ADMIN-TRIGGERED — BVN not stored here]",
        nibssResponsePayload: JSON.stringify({
          adminForced: true, tfanId, orgId, timestamp: new Date().toISOString(),
        }),
        orgId,
      },
    });

    return {
      tfanId,
      accountPublicRef: result.accountPublicRef,
      status:           result.status,
      message:          "Admin-forced upgrade complete. TfanRecord mirrored. Tier-1 account created.",
    };
  }

  // ── BEPWG Admin Audit ────────────────────────────────────────────────────────

  /**
   * Paginated BEPWG withdrawal audit log.
   * Returns every BepwgWithdrawalLog row ordered newest-first, with full
   * GPS coordinates, proximity distance, verification method, and penalty detail.
   *
   * GET /v1/admin/bepwg/withdrawal-logs
   */
  async bepwgWithdrawalLogs(orgId: string, take = 50) {
    await this.prisma.setOrgContext(orgId);
    const rows = await this.prisma.bepwgWithdrawalLog.findMany({
      where:   { orgId },
      orderBy: { executedAt: "desc" },
      take,
    });

    const totalPenalty = rows.reduce(
      (acc, r) => acc + BigInt(r.penaltyMinor.toFixed(0)),
      0n,
    );
    const byMethod = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.verificationMethod] = (acc[r.verificationMethod] ?? 0) + 1;
      return acc;
    }, {});
    const bypassCount  = rows.filter((r) => !r.withinProximity).length;
    const penaltyCount = rows.filter((r) => r.penaltyMinor.toNumber() > 0).length;

    return {
      total:            rows.length,
      byMethod,
      bypassCount,
      penaltyCount,
      totalPenaltyMinor: totalPenalty.toString(),
      rows,
    };
  }

  /**
   * BEPWG Location Anchor statistics.
   * Returns count of registered anchors, breakdown by org, and
   * the 10 most recently registered/updated anchors.
   *
   * GET /v1/admin/bepwg/anchor-stats
   */
  async bepwgAnchorStats(orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const [totalAnchors, recentAnchors, trustedLinkCount] = await Promise.all([
      this.prisma.locationAnchor.count({ where: { orgId } }),
      this.prisma.locationAnchor.findMany({
        where:   { orgId },
        orderBy: { updatedAt: "desc" },
        take:    10,
        select: {
          customerBvnHash: true,
          latitudeDeg:     true,
          longitudeDeg:    true,
          capturedAt:      true,
          updatedAt:       true,
        },
      }),
      this.prisma.trustedAgentLink.count({ where: { orgId } }),
    ]);

    return {
      totalAnchors,
      trustedLinkCount,
      recentAnchors,
      message: "Location anchors registered in this org. Each anchor enables 10m proximity gating.",
    };
  }
}
