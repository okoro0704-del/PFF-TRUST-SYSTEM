import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { LocationAnchorService } from "./location-anchor.service";
import { TrustedAgentService } from "./trusted-agent.service";
import { BepwgGateService } from "./bepwg-gate.service";
import { RegisterLocationDto } from "./dto/register-location.dto";
import { TrustLinkDto } from "./dto/trust-link.dto";
import { BepwgWithdrawDto } from "./dto/bepwg-withdraw.dto";

/**
 * BEPWG — Biometric Exchequer & Proximity Withdrawal Gate
 *
 * Enforces the "Biometric-Only" withdrawal mandate with the 10m Proximity Rule.
 * No card. No PIN. No password. Physical presence + biometrics only.
 *
 * YES Triad (any ONE for Standard path, TWO for Bypass):
 *   Gate 1: HD Face Verification
 *   Gate 2: Fingerprint Minutiae Match
 *   Gate 3: BVN/TFAN Push Notification (ICAD mobile)
 */
@ApiTags("bepwg")
@Controller("v1/bepwg")
export class BepwgController {
  constructor(
    private readonly locationSvc: LocationAnchorService,
    private readonly agentSvc:    TrustedAgentService,
    private readonly gate:        BepwgGateService,
  ) {}

  /**
   * Register or update the customer's Location Anchor — the static GPS reference
   * point for the NIBSS 10-Meter Rule. Captured at account creation.
   * Returns a fresh HMAC-signed offline cache token for the POS to store locally.
   */
  @ApiOperation({
    summary:
      "Register location anchor — stores GPS coordinates for 10m Rule; returns offline cache token for POS",
  })
  @Post("location/register")
  registerLocation(@Body() dto: RegisterLocationDto) {
    return this.locationSvc.registerAnchor(dto);
  }

  /**
   * Retrieve anchor details and generate a fresh offline cache token.
   * Call this at every terminal heartbeat to refresh the POS local cache.
   */
  @ApiOperation({
    summary:
      "Get location anchor + fresh offline token — call at heartbeat to refresh POS local proximity cache",
  })
  @Get("location/:customerBvnHash/offline-cache")
  getOfflineCache(
    @Param("customerBvnHash") customerBvnHash: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.locationSvc.getAnchorAndFreshToken(customerBvnHash, orgId);
  }

  /**
   * Manually establish a Trusted Agent Link between a customer and an agent.
   * Links are also auto-created at cycle open and incremented on each withdrawal.
   */
  @ApiOperation({
    summary: "Establish trusted agent link — enables standard (1-gate) withdrawals for this agent pair",
  })
  @Post("trust/link")
  trustLink(@Body() dto: TrustLinkDto) {
    return this.agentSvc.linkFromBvns(dto.customerBvn, dto.agentBvn, dto.orgId ?? "default");
  }

  /**
   * List all trusted agents for a customer (ordered by cycle count desc).
   */
  @ApiOperation({ summary: "List trusted agents — shows all agents with shared savings history" })
  @Get("trust/:customerBvnHash/agents")
  listTrustedAgents(
    @Param("customerBvnHash") customerBvnHash: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.agentSvc.listTrustedAgents(customerBvnHash, orgId);
  }

  /**
   * Execute a BEPWG withdrawal — the full Biometric Mandate + 10m Rule gate.
   *
   * Standard path (1/3 gate): mature cycle + within 10m + trusted agent.
   * Bypass path  (2/3 gate): any condition unmet; incomplete cycles incur 50% penalty.
   *
   * Online:  GPS checked server-side against LocationAnchor; NIBSS called for all provided gates.
   * Offline: POS provides HMAC-signed offline cache token; NIBSS called if network available.
   */
  @ApiOperation({
    summary:
      "Execute BEPWG withdrawal — YES Triad biometric gate + 10m proximity rule + trusted agent check",
  })
  @Post("withdraw")
  withdraw(@Body() dto: BepwgWithdrawDto, @Query("orgId") orgId = "default") {
    return this.gate.executeWithdrawal(dto, dto.orgId ?? orgId);
  }

  /**
   * Get the immutable BEPWG withdrawal audit log for a savings cycle.
   * Includes GPS coordinates, distance from anchor, verification method, and penalty details.
   */
  @ApiOperation({
    summary:
      "BEPWG audit log — GPS, distance from anchor, biometric method, penalty for every withdrawal event",
  })
  @Get("withdraw/log/:cycleRef")
  withdrawalLog(
    @Param("cycleRef") cycleRef: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.gate.getWithdrawalLog(cycleRef, orgId);
  }
}

