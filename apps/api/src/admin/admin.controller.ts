import { Body, Controller, Get, Param, Post, Query, Sse, MessageEvent } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Observable, interval, map, switchMap } from "rxjs";
import { AdminService } from "./admin.service";
import { LiquidityIngestDto } from "./dto/liquidity-ingest.dto";
import { ForceBankabilityDto } from "./dto/force-bankability.dto";

@ApiTags("admin")
@Controller("v1/admin")
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @ApiOperation({ summary: "Verification ledger — last N rows across all gates" })
  @Get("logs")
  logs(@Query("orgId") orgId = "default", @Query("take") take?: string) {
    return this.admin.logs(orgId, take ? parseInt(take, 10) : 100);
  }

  @ApiOperation({ summary: "Sentinel mismatch alerts — Second Watch fraud signals" })
  @Get("alerts/sentinel")
  alerts(@Query("orgId") orgId = "default", @Query("take") take?: string) {
    return this.admin.sentinelAlerts(orgId, take ? parseInt(take, 10) : 50);
  }

  @ApiOperation({ summary: "Liquidity mirror — latest balance snapshot per partner bank" })
  @Get("liquidity")
  liquidity() {
    return this.admin.liquidityMirror();
  }

  @ApiOperation({ summary: "Execution metrics — withdrawal / transfer / bill totals" })
  @Get("execution/metrics")
  executionMetrics(@Query("orgId") orgId = "default") {
    return this.admin.executionMetrics(orgId);
  }

  @ApiOperation({ summary: "System health — DB connectivity probe" })
  @Get("system/health")
  systemHealth() {
    return this.admin.systemHealth();
  }

  @ApiOperation({ summary: "Ingest liquidity snapshot — upsert partner bank balance" })
  @Post("liquidity/ingest")
  ingest(@Body() dto: LiquidityIngestDto) {
    return this.admin.ingestLiquidity(dto.partnerBank, dto.accountRef, dto.balanceMinor, dto.currencyCode);
  }

  @ApiOperation({ summary: "SSE stream — real-time verification ledger (5s poll)" })
  @Sse("logs/stream")
  logStream(@Query("orgId") orgId = "default"): Observable<MessageEvent> {
    return interval(5000).pipe(
      switchMap(() => this.admin.logs(orgId, 50)),
      map((data) => ({ data: JSON.stringify(data) }) as MessageEvent),
    );
  }

  @ApiOperation({ summary: "Unbanked metrics — profile counts by status, bankability rate, Watch Eye log size" })
  @Get("unbanked/metrics")
  unbankedMetrics(@Query("orgId") orgId = "default") {
    return this.admin.unbankedMetrics(orgId);
  }

  @ApiOperation({ summary: "Second Watch audit — ledger rows resolved via Watch Eye when NIBSS portal was down" })
  @Get("unbanked/watch-eye-events")
  watchEyePrimaryEvents(
    @Query("orgId") orgId = "default",
    @Query("take") take?: string,
  ) {
    return this.admin.watchEyePrimaryEvents(orgId, take ? parseInt(take, 10) : 50);
  }

  @ApiOperation({ summary: "Admin force-bankability — manual BVN override when NIBSS callback was dropped" })
  @Post("unbanked/:tfanId/force-bankability")
  forceBankability(
    @Param("tfanId") tfanId: string,
    @Body() dto: ForceBankabilityDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.admin.forceBankability(tfanId, dto.bvn, dto.orgId ?? orgId);
  }

  // ── BEPWG Admin Audit ─────────────────────────────────────────────────────

  /**
   * BEPWG withdrawal audit log — every withdrawal with GPS, distance, biometric
   * method, penalty event ID, and net payout. Ordered newest-first.
   *
   * Aggregates: byMethod breakdown, bypass count, penalty count, total penalty.
   */
  @ApiOperation({
    summary:
      "BEPWG withdrawal audit log — GPS, distance from anchor, verification method, penalty breakdown",
  })
  @Get("bepwg/withdrawal-logs")
  bepwgWithdrawalLogs(
    @Query("orgId") orgId = "default",
    @Query("take") take?: string,
  ) {
    return this.admin.bepwgWithdrawalLogs(orgId, take ? parseInt(take, 10) : 50);
  }

  /**
   * BEPWG Location Anchor statistics — total registered anchors,
   * trusted agent link count, 10 most recently updated anchors.
   */
  @ApiOperation({
    summary:
      "BEPWG anchor stats — registered GPS anchors, trusted agent links count, recent registrations",
  })
  @Get("bepwg/anchor-stats")
  bepwgAnchorStats(@Query("orgId") orgId = "default") {
    return this.admin.bepwgAnchorStats(orgId);
  }
}
