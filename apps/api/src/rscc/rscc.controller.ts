import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RsccLicenseService } from "./rscc-license.service";
import { RsccSwitchingService } from "./rscc-switching.service";
import { RsccAjoService } from "./rscc-ajo.service";
import { RsccDistributionService } from "./rscc-distribution.service";
import { ConfirmRenewalDto } from "./dto/confirm-renewal.dto";
import { SwitchingFilterDto } from "./dto/switching-filter.dto";

/**
 * RSCC — Revenue & Settlement Command Center
 *
 * Three-Stream Revenue Monitor:
 *   Stream 1 — License Management (31-day T-Minus clock)
 *   Stream 2 — Switching & Transaction Tolls (NIBSS YES calls + fee accumulation)
 *   Stream 3 — Ajo (Secured Saving) Ledger
 *
 * Distribution Engine:
 *   60% Agent Liquidity — daily 40/60 split + 2% daily reward tracker
 *   Red-Flag System — auto-triggered when dedicated account < 48h payout projection
 */
@ApiTags("rscc")
@Controller("v1/rscc")
export class RsccController {
  constructor(
    private readonly license:  RsccLicenseService,
    private readonly switching:RsccSwitchingService,
    private readonly ajo:      RsccAjoService,
    private readonly dist:     RsccDistributionService,
  ) {}

  // ── Stream 1: License Management ──────────────────────────────────────────
  @ApiOperation({ summary: "List all bank licenses with live T-Minus countdown (daysRemaining, barPct, status). Status auto-corrected on each call." })
  @Get("licenses")
  listLicenses(@Query("orgId") orgId = "default") {
    return this.license.listLicenses(orgId);
  }

  @ApiOperation({
    summary:
      "Confirm license renewal. Extends licenseEndDate +31 days, lifts API restriction, " +
      "resolves LICENSE_EXPIRING red flags. Call after bank deposits ₦500,000 in dedicated account.",
  })
  @Patch("licenses/:id/renew")
  confirmRenewal(@Param("id") id: string, @Body() dto: ConfirmRenewalDto) {
    return this.license.confirmRenewal(id, dto);
  }

  @Get("export/licenses")
  @ApiOperation({ summary: "Export license ledger as CSV (for CBN/NIBSS monthly reporting)." })
  exportLicenses(@Query("orgId") orgId = "default") {
    return this.license.exportCsv(orgId);
  }

  // ── Stream 2: Switching Tolls ──────────────────────────────────────────────
  @ApiOperation({
    summary:
      "Switching toll summary: total NIBSS YES calls, fees by type (Transfer/Bill/Withdrawal), " +
      "24h volume heatmap. Filter by tollType, sessionType, bankCode, agentState (10m-Rule).",
  })
  @Get("switching")
  switchingSummary(@Query() filter: SwitchingFilterDto) {
    return this.switching.getSummary(filter.orgId, filter);
  }

  @ApiOperation({ summary: "Paginated switching toll ledger with geo-filter support (agentState/LGA)." })
  @Get("switching/tolls")
  listTolls(@Query() filter: SwitchingFilterDto) {
    return this.switching.listTolls(filter.orgId, filter);
  }

  @Get("export/switching")
  @ApiOperation({ summary: "Export switching toll ledger as CSV." })
  exportSwitching(@Query("orgId") orgId = "default") {
    return this.switching.exportCsv(orgId);
  }

  // ── Stream 3: Ajo Ledger ───────────────────────────────────────────────────
  @ApiOperation({
    summary:
      "Searchable Ajo registry. Returns Day X/31 cycle progress, Day-1 fee status (COLLECTED/PENDING/FAILED), " +
      "balance, safe-break penalty. Filter by holderName, bankName, or accountRef.",
  })
  @Get("ajo")
  listAjo(@Query("search") search?: string, @Query("orgId") orgId = "default") {
    return this.ajo.listAccounts(orgId, search);
  }

  @Get("ajo/summary")
  @ApiOperation({ summary: "Ajo aggregate metrics: TVL, active savers, total Day-1 collected, projected month-end." })
  ajoSummary(@Query("orgId") orgId = "default") {
    return this.ajo.getSummary(orgId);
  }

  @Get("export/ajo")
  @ApiOperation({ summary: "Export Ajo registry as CSV." })
  exportAjo(@Query("orgId") orgId = "default") {
    return this.ajo.exportCsv(orgId);
  }

  // ── Distribution Engine ────────────────────────────────────────────────────
  @ApiOperation({
    summary:
      "Today's 40/60 Day-1 fee split: F-Man share, agent pool, 2% daily reward pool, " +
      "per-agent wallet credit. Disbursement status: DISBURSED | PENDING_CONFIRMATION.",
  })
  @Get("distribution")
  dailySplit(@Query("orgId") orgId = "default") {
    return this.dist.getDailySplit(orgId);
  }

  @Get("distribution/history")
  @ApiOperation({ summary: "Last 30 days of distribution records with split details." })
  distributionHistory(@Query("orgId") orgId = "default", @Query("days") days = "7") {
    return this.dist.getDistributions(orgId, parseInt(days, 10));
  }

  @Get("export/distribution")
  @ApiOperation({ summary: "Export 30-day distribution ledger as CSV." })
  exportDistribution(@Query("orgId") orgId = "default") {
    return this.dist.exportCsv(orgId);
  }

  // ── Red-Flag System ────────────────────────────────────────────────────────
  @ApiOperation({
    summary:
      "List active Admin Red-Flags. Includes LOW_DEDICATED_ACCOUNT (CRITICAL — balance < 48h threshold), " +
      "LICENSE_EXPIRING, AJO_SAFE_BREAK. Sorted by severity DESC.",
  })
  @Get("red-flags")
  redFlags(@Query("orgId") orgId = "default") {
    return this.dist.getRedFlags(orgId);
  }

  @ApiOperation({
    summary:
      "Trigger a fresh red-flag scan on dedicated account balances. " +
      "Creates CRITICAL flags for any bank whose balance < 48h projected payout.",
  })
  @Patch("red-flags/scan")
  scanRedFlags(@Query("orgId") orgId = "default") {
    return this.dist.checkAndTriggerRedFlags(orgId);
  }

  @ApiOperation({ summary: "Resolve a specific red-flag alert. Stamps resolvedAt + resolvedBy." })
  @Patch("red-flags/:id/resolve")
  resolveFlag(@Param("id") id: string, @Query("resolvedBy") resolvedBy = "admin", @Query("orgId") orgId = "default") {
    return this.dist.resolveRedFlag(id, resolvedBy, orgId);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  @Get("summary")
  @ApiOperation({ summary: "RSCC quick summary: license counts + Ajo aggregate + today's split + active red flags." })
  async summary(@Query("orgId") orgId = "default") {
    const [licData, ajoData, split, flags] = await Promise.all([
      this.license.listLicenses(orgId),
      this.ajo.getSummary(orgId),
      this.dist.getDailySplit(orgId),
      this.dist.getRedFlags(orgId),
    ]);
    return { licenses: licData.stats, ajo: ajoData, distribution: split, activeRedFlags: flags.count };
  }
}

