import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { LivenessChallengeService } from "./liveness-challenge.service";
import { FingerprintAbstractionService } from "./fingerprint-abstraction.service";
import { NetworklessChallengeService } from "./networkless-challenge.service";
import { LbasAuditService } from "./lbas-audit.service";
import { IssueChallengeDto } from "./dto/issue-challenge.dto";
import { SubmitLivenessDto } from "./dto/submit-liveness.dto";
import { RegisterSensorDto } from "./dto/register-sensor.dto";
import { SubmitFingerprintDto } from "./dto/submit-fingerprint.dto";
import { InitiateNetworklessDto } from "./dto/initiate-networkless.dto";
import { StepAApproveDto, StepBConfirmDto } from "./dto/confirm-networkless.dto";

/**
 * LBAS — Liveness, External Biometric & Networkless Authentication Suite
 *
 * Three sub-protocols:
 *   1. Face Pay Liveness  — randomised task challenge → optical-flow proof → NIBSS match
 *   2. FAP-20 Abstraction — external USB/Bluetooth fingerprint sensor → NIBSS gate
 *   3. Networkless TOTP   — POS-phone TOTP + cognitive challenge (2-step approval)
 */
@ApiTags("lbas")
@Controller("v1/lbas")
export class LbasController {
  constructor(
    private readonly liveness:     LivenessChallengeService,
    private readonly fingerprint:  FingerprintAbstractionService,
    private readonly networkless:  NetworklessChallengeService,
    private readonly auditSvc:     LbasAuditService,
  ) {}

  // ── Face Pay Liveness ────────────────────────────────────────────────────────

  @ApiOperation({
    summary:
      "Issue liveness challenge — randomised task sequence (1–3 tasks) with 90-second TTL. " +
      "Anti-replay: every call generates a unique session token and shuffled task list.",
  })
  @Post("liveness/challenge")
  issueChallenge(@Body() dto: IssueChallengeDto) {
    return this.liveness.issueChallenge(dto);
  }

  @ApiOperation({
    summary:
      "Submit optical-flow proof — validates livenessScore ≥ 0.80, depthVariance ≥ 0.70, frames ≥ 8 " +
      "per task, then runs NIBSS face match. Returns Face_Match: YES / NO.",
  })
  @Post("liveness/verify")
  submitProof(@Body() dto: SubmitLivenessDto) {
    return this.liveness.submitProof(dto);
  }

  @ApiOperation({ summary: "Get liveness challenge status — check completion / expiry" })
  @Get("liveness/:sessionToken")
  challengeStatus(
    @Param("sessionToken") sessionToken: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.liveness.getChallengeStatus(sessionToken, orgId);
  }

  // ── Universal Fingerprint (FAP-20) ───────────────────────────────────────────

  @ApiOperation({
    summary:
      "Register external FAP-20 sensor — Dermalog LF10, SecuGen Hamster, Aratek A600, Generic FAP-20. " +
      "USB or Bluetooth. Bound to agent BVN.",
  })
  @Post("fingerprint/sensor/register")
  registerSensor(@Body() dto: RegisterSensorDto) {
    return this.fingerprint.registerSensor(dto);
  }

  @ApiOperation({
    summary:
      "Submit external fingerprint minutiae (ISO 19794-2 / WSQ) to the NIBSS gate. " +
      "Transport-encrypted by TLS 1.3. Raw template never persisted.",
  })
  @Post("fingerprint/submit")
  submitFingerprint(@Body() dto: SubmitFingerprintDto) {
    return this.fingerprint.submitExternalMinutiae(dto);
  }

  @ApiOperation({ summary: "Get FAP-20 sensor registration status" })
  @Get("fingerprint/sensor/:deviceId")
  sensorStatus(@Param("deviceId") deviceId: string, @Query("orgId") orgId = "default") {
    return this.fingerprint.getSensorStatus(deviceId, orgId);
  }

  // ── Networkless Challenge-Response (TOTP) ────────────────────────────────────

  @ApiOperation({
    summary:
      "POS initiates networkless challenge — generates RFC 6238 TOTP, sends cognitive push to phone. " +
      "Returns posDisplayCode for POS terminal screen (refreshes every 30s).",
  })
  @Post("networkless/initiate")
  initiateNetworkless(@Body() dto: InitiateNetworklessDto) {
    return this.networkless.initiateSession(dto);
  }

  @ApiOperation({
    summary:
      "POS polls for current display code — 6-digit TOTP refreshed every 30s. " +
      "Display on terminal screen for customer to read.",
  })
  @Get("networkless/:sessionRef/pos-code")
  getPosCode(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.networkless.getPosDisplayCode(sessionRef, orgId);
  }

  @ApiOperation({ summary: "Customer phone: get session status and cognitive challenge task" })
  @Get("networkless/:sessionRef/status")
  sessionStatus(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.networkless.getSessionStatus(sessionRef, orgId);
  }

  @ApiOperation({
    summary:
      "Step A — customer clicks YES and submits cognitive challenge answer on phone. " +
      "Correct answer advances session to APPROVED_STEP_A.",
  })
  @Post("networkless/:sessionRef/step-a")
  stepA(
    @Param("sessionRef") sessionRef: string,
    @Body() dto: StepAApproveDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.networkless.approveStepA(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step B — customer enters 6-digit POS code on phone. TOTP validated (±1 step). " +
      "On success: session → COMPLETED, POS terminal authorised to release funds.",
  })
  @Post("networkless/:sessionRef/step-b")
  stepB(
    @Param("sessionRef") sessionRef: string,
    @Body() dto: StepBConfirmDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.networkless.confirmStepB(sessionRef, dto);
  }

  @ApiOperation({ summary: "LBAS audit trail for a session — all events in chronological order" })
  @Get("audit/:sessionRef")
  auditTrail(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.auditSvc.getSessionAudit(sessionRef, orgId);
  }
}

