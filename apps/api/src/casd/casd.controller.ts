import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CasdBankPipelineService } from "./casd-bank-pipeline.service";
import { CasdSovereignVaultService } from "./casd-sovereign-vault.service";
import { CasdMetricsService } from "./casd-metrics.service";
import { UpdateBankStatusDto } from "./dto/update-bank-status.dto";
import { PushToBankDto } from "./dto/push-to-bank.dto";

/**
 * CASD — Command Center: Master Admin & Settlement Dashboard
 *
 * Four modules:
 *
 * 1. BANK PIPELINE — Institutional onboarding queue
 *    GET  /v1/casd/banks                          — list all FI applications (filterable by status)
 *    PATCH /v1/casd/banks/:id/status              — advance stage or reject (3-stage toggle)
 *    GET  /v1/casd/banks/:id/documents            — view uploaded regulatory documents
 *    POST /v1/casd/banks/:id/push                 — manually push sovereign documents to bank
 *
 * 2. SOVEREIGN VAULT — F-Man Technologies document repository
 *    GET  /v1/casd/sovereign                      — list all 6 pre-verified documents
 *    POST /v1/casd/sovereign/:id/download         — increment download counter
 *    GET  /v1/casd/sovereign/pushes               — recent push history
 *
 * 3. FOUR-PILLAR PULSE MONITOR
 *    GET  /v1/casd/pulse                          — BSSS + SovereignExec + Ajo + Exchequer metrics
 *
 * 4. FINANCIAL RECONCILIATION
 *    GET  /v1/casd/reconciliation                 — 40/60 split + 2% liquidity accounts
 *
 * 5. SUMMARY
 *    GET  /v1/casd/summary                        — pipeline status counts
 */
@ApiTags("casd")
@Controller("v1/casd")
export class CasdController {
  constructor(
    private readonly pipeline: CasdBankPipelineService,
    private readonly vault:    CasdSovereignVaultService,
    private readonly metrics:  CasdMetricsService,
  ) {}

  // ── Bank Pipeline ──────────────────────────────────────────────────────────
  @ApiOperation({ summary: "List all FI applications. Filter by status: PENDING_REVIEW | VERIFICATION_IN_PROGRESS | APPROVED | REJECTED." })
  @Get("banks")
  listBanks(@Query("status") status?: string, @Query("orgId") orgId = "default") {
    return this.pipeline.listApplications(orgId, status);
  }

  @ApiOperation({
    summary:
      "Advance application status (PENDING_REVIEW → VERIFICATION_IN_PROGRESS → APPROVED) " +
      "or REJECTED. On APPROVED: auto-pushes all sovereign documents to the bank's contact email.",
  })
  @Patch("banks/:id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateBankStatusDto) {
    return this.pipeline.advanceStatus(id, dto);
  }

  @ApiOperation({ summary: "List regulatory documents uploaded by the FI during onboarding." })
  @Get("banks/:id/documents")
  getDocuments(@Param("id") id: string, @Query("orgId") orgId = "default") {
    return this.pipeline.getDocuments(id, orgId);
  }

  @ApiOperation({
    summary:
      "Manually push sovereign documents to an approved bank. " +
      "If documentIds is empty, all active vault documents are pushed.",
  })
  @Post("banks/:id/push")
  pushToBank(@Param("id") id: string, @Body() dto: PushToBankDto) {
    return this.vault.pushToBank(id, dto);
  }

  // ── Sovereign Vault ────────────────────────────────────────────────────────
  @ApiOperation({ summary: "List all F-Man Technologies sovereign documents in the vault." })
  @Get("sovereign")
  listSovereign(@Query("orgId") orgId = "default") {
    return this.vault.listDocuments(orgId);
  }

  @ApiOperation({ summary: "Record a download event for a sovereign document." })
  @Post("sovereign/:id/download")
  downloadSovereign(@Param("id") id: string) {
    return this.vault.incrementDownload(id);
  }

  @ApiOperation({ summary: "Recent push history — who received what sovereign documents and when." })
  @Get("sovereign/pushes")
  recentPushes(@Query("orgId") orgId = "default", @Query("limit") limit?: string) {
    return this.vault.getRecentPushes(orgId, limit ? parseInt(limit, 10) : 20);
  }

  // ── Pulse Monitor ──────────────────────────────────────────────────────────
  @ApiOperation({
    summary:
      "Four-Pillar Pulse Monitor. Returns real-time metrics: " +
      "BSSS (biometrics), SovereignExec (transactions), SecuredSaving/Ajo, BiometricExchequer (withdrawals).",
  })
  @Get("pulse")
  pulse(@Query("orgId") orgId = "default") {
    return this.metrics.getPulseMetrics(orgId);
  }

  // ── Reconciliation ─────────────────────────────────────────────────────────
  @ApiOperation({
    summary:
      "Financial reconciliation: 40/60 split tracker (Day-1 fees) + " +
      "2% Liquidity Payout monitor (dedicated accounts at approved banks).",
  })
  @Get("reconciliation")
  reconciliation(@Query("orgId") orgId = "default") {
    return this.metrics.getReconciliation(orgId);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  @ApiOperation({ summary: "Pipeline status summary counts." })
  @Get("summary")
  summary(@Query("orgId") orgId = "default") {
    return this.pipeline.getSummary(orgId);
  }
}

