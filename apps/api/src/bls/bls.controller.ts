import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BlsDiscoveryService } from "./bls-discovery.service";
import { BlsSealService } from "./bls-seal.service";
import { InitiateDiscoveryDto } from "./dto/initiate-discovery.dto";
import { SubmitDiscoveryScanDto } from "./dto/submit-discovery-scan.dto";
import { SelectAccountDto } from "./dto/select-account.dto";
import { SubmitSealScanDto } from "./dto/submit-seal-scan.dto";

/**
 * BLS-TSA — Biometric Liquidity Sweep & Two-Step Authorization
 *
 * Scan-to-Discover withdrawal flow (4 steps):
 *
 *   Step 0: POST /v1/bls/initiate
 *           Prime session. Returns { sessionRef, sessionToken, idleExpiresAt }.
 *           60-second idle timer starts immediately.
 *
 *   Step 1: POST /v1/bls/:ref/discover  { rawTemplateB64, sessionToken }
 *           FAP-20 minutiae → AES-256-GCM encrypt → NIBSS 1:N national registry search.
 *           On MatchFound: Account Mapping Feed — discovers ALL linked accounts + balances
 *           across every financial institution in the BVN footprint.
 *           Returns masked account list (no full NUBANs, no raw balances in transit).
 *           Stores bvnAnchorHash for Seal cross-validation.
 *
 *   Step 2: POST /v1/bls/:ref/select   { selectedAccountRef, amountMinor, sessionToken }
 *           User picks source account + enters withdrawal amount.
 *           Validates amount ≤ balance (inside encrypted blob — never logged).
 *           Returns confirmation prompt: "Confirm Withdrawal of ₦X from [Bank]?"
 *           Resets 60-second idle timer.
 *
 *   Step 3: POST /v1/bls/:ref/seal     { rawTemplateB64, sessionToken }
 *           Second FAP-20 scan — the Mandatory Biometric Seal.
 *           AES-256-GCM encrypt → NIBSS 1:N → cross-validate: sealBvnHash == bvnAnchorHash.
 *           On pass: withdrawal executed, accountMapBlob zeroed, session token invalidated.
 *           Audit: Discovery_Scan_ID + Selected_Bank_Code + Final_Authorization_Scan_ID.
 */
@ApiTags("bls")
@Controller("v1/bls")
export class BlsController {
  constructor(
    private readonly discovery: BlsDiscoveryService,
    private readonly seal:      BlsSealService,
  ) {}

  @ApiOperation({
    summary:
      "Step 0 — Initiate BLS-TSA session. Returns sessionRef + encrypted sessionToken. " +
      "60-second rolling idle timer starts immediately. Token is required on all subsequent calls.",
  })
  @Post("initiate")
  initiate(@Body() dto: InitiateDiscoveryDto) {
    return this.discovery.initiate(dto);
  }

  @ApiOperation({
    summary:
      "Step 1 — Discovery Scan: submit FAP-20 minutiae. Server encrypts AES-256-GCM → NIBSS 1:N → " +
      "Account Mapping Feed (ALL linked bank accounts + real-time balances, encrypted at rest). " +
      "Returns masked account list + identity preview. Template purged immediately post-match. " +
      "bvnAnchorHash sealed into session for Step 3 cross-validation.",
  })
  @Post(":sessionRef/discover")
  discover(@Param("sessionRef") sessionRef: string, @Body() dto: SubmitDiscoveryScanDto) {
    return this.discovery.submitDiscoveryScan(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 2 — Select source account + enter withdrawal amount. " +
      "Validates amount does not exceed discovered balance (check inside encrypted blob). " +
      "Returns confirmation prompt: 'Confirm Withdrawal of ₦X from [Bank]?' " +
      "Advances session to AWAITING_SEAL. Resets idle timer.",
  })
  @Post(":sessionRef/select")
  select(@Param("sessionRef") sessionRef: string, @Body() dto: SelectAccountDto) {
    return this.discovery.selectAccount(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 3 — Final Biometric Seal (Second Fingerprint Scan). " +
      "AES-256-GCM encrypt → NIBSS 1:N → cross-validate: same BVN as Discovery Scan. " +
      "On pass: withdrawal executed, accountMapBlob zeroed (Zero-Knowledge Storage), " +
      "templateDataPurgedAt stamped, session token invalidated. " +
      "Audit log: Discovery_Scan_ID + Selected_Bank_Code + Final_Authorization_Scan_ID.",
  })
  @Post(":sessionRef/seal")
  submitSeal(@Param("sessionRef") sessionRef: string, @Body() dto: SubmitSealScanDto) {
    return this.seal.submitSealScan(sessionRef, dto);
  }

  @ApiOperation({ summary: "Poll BLS-TSA session status." })
  @Get(":sessionRef/status")
  status(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.discovery.assertActive(sessionRef, orgId);
  }
}

