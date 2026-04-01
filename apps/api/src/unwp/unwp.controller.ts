import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { UnwpSessionService } from "./unwp-session.service";
import { PosOfflineLedgerService } from "./pos-offline-ledger.service";
import { LbasAuditService } from "../lbas/lbas-audit.service";
import { InitiateUnwpDto } from "./dto/initiate-unwp.dto";
import { StepAApproveUnwpDto, StepBConfirmUnwpDto } from "./dto/approve-unwp.dto";
import { EscalateUnwpDto, SubmitEscalationBiometricDto } from "./dto/escalate-unwp.dto";
import { CommitLedgerDto, ReconcileLedgerDto } from "./dto/commit-ledger.dto";

/**
 * UNWP — Universal Networkless Withdrawal Protocol
 *
 * Three execution paths:
 *   1. Standard (Mobility Freedom) — TOTP + cognitive two-step; no geospatial restriction
 *   2. Biometric Escalation — fallback if phone push fails; requires NIBSS heartbeat
 *   3. Offline Ledger — encrypted POS queue; NIBSS reconciliation on connectivity restore
 */
@ApiTags("unwp")
@Controller("v1/unwp")
export class UnwpController {
  constructor(
    private readonly session: UnwpSessionService,
    private readonly ledger:  PosOfflineLedgerService,
    private readonly audit:   LbasAuditService,
  ) {}

  // ── Standard Networkless Path ─────────────────────────────────────────────

  @ApiOperation({
    summary:
      "Initiate UNWP session — Mobility Freedom Rule: no 10m geospatial restriction for standard BVN accounts. " +
      "Generates TLI (anti-double-spend), TOTP seed, and cognitive task. Sends push to BVN-linked phone.",
  })
  @Post("initiate")
  initiate(@Body() dto: InitiateUnwpDto) {
    return this.session.initiateSession(dto);
  }

  @ApiOperation({
    summary:
      "POS polls for current 6-digit display code — refreshes every 30s (RFC 6238). " +
      "Display on terminal screen; customer reads it on Step-B.",
  })
  @Get(":sessionRef/pos-code")
  getPosCode(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.session.getPosDisplayCode(sessionRef, orgId);
  }

  @ApiOperation({ summary: "Phone polls session status + cognitive challenge task" })
  @Get(":sessionRef/status")
  status(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.session.getSessionStatus(sessionRef, orgId);
  }

  @ApiOperation({
    summary:
      "Step-A — Customer taps YES and answers cognitive challenge on phone. " +
      "Correct → APPROVED_STEP_A. Returns refreshed 6-digit POS code for Step-B.",
  })
  @Post(":sessionRef/step-a")
  stepA(@Param("sessionRef") sessionRef: string, @Body() dto: StepAApproveUnwpDto) {
    return this.session.approveStepA(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step-B — Customer enters 6-digit POS code on phone. TOTP validated (±1 step). " +
      "Success → COMPLETED. POS authorized to release funds. Commit to offline ledger immediately.",
  })
  @Post(":sessionRef/step-b")
  stepB(@Param("sessionRef") sessionRef: string, @Body() dto: StepBConfirmUnwpDto) {
    return this.session.confirmStepB(sessionRef, dto);
  }

  // ── Biometric Escalation Failsafe ─────────────────────────────────────────

  @ApiOperation({
    summary:
      "Trigger biometric escalation — called by POS when push/challenge fails (phone dead, no signal). " +
      "Transitions session → BIOMETRIC_ESCALATION. POS must prompt for Face or Fingerprint scan.",
  })
  @Post(":sessionRef/escalate")
  escalate(@Param("sessionRef") sessionRef: string, @Body() dto: EscalateUnwpDto) {
    return this.session.escalate(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Submit biometric proof during escalation — Face frame (JPEG/PNG) or Fingerprint (ISO 19794-2/WSQ). " +
      "Requires minimal NIBSS network heartbeat. On YES → COMPLETED; POS releases funds.",
  })
  @Post(":sessionRef/escalation/biometric")
  submitEscalationBiometric(
    @Param("sessionRef") sessionRef: string,
    @Body() dto: SubmitEscalationBiometricDto,
  ) {
    return this.session.submitEscalationBiometric(sessionRef, dto);
  }

  // ── Offline Ledger ────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      "Commit completed transaction to encrypted POS offline ledger (AES-256-GCM + SHA-256 checksum). " +
      "Anti-double-spend: TLI uniqueness enforced at DB level. Call immediately after Step-B or biometric OK.",
  })
  @Post("ledger/commit")
  commitLedger(@Body() dto: CommitLedgerDto) {
    return this.ledger.commitTransaction(dto);
  }

  @ApiOperation({
    summary:
      "Reconcile all QUEUED ledger entries for a terminal against NIBSS — call when POS regains network. " +
      "Decrypts each entry, validates SHA-256 checksum, submits to NIBSS, marks RECONCILED or REJECTED.",
  })
  @Post("ledger/reconcile")
  reconcileLedger(@Body() dto: ReconcileLedgerDto) {
    return this.ledger.reconcileTerminal(dto);
  }

  @ApiOperation({ summary: "Get ledger entry status by TLI" })
  @Get("ledger/:tli")
  getLedgerEntry(@Param("tli") tli: string, @Query("orgId") orgId = "default") {
    return this.ledger.getLedgerEntry(tli, orgId);
  }

  @ApiOperation({ summary: "List all offline ledger entries for a terminal (last 100)" })
  @Get("ledger/terminal/:terminalId")
  getTerminalQueue(@Param("terminalId") terminalId: string, @Query("orgId") orgId = "default") {
    return this.ledger.getTerminalQueue(terminalId, orgId);
  }

  @ApiOperation({ summary: "UNWP audit trail for a session — all events in chronological order" })
  @Get("audit/:sessionRef")
  auditTrail(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.audit.getSessionAudit(sessionRef, orgId);
  }
}

