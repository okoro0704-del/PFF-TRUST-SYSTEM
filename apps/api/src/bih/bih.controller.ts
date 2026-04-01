import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { BihScanService } from "./bih-scan.service";
import { BihGateService } from "./bih-gate.service";
import { NibssSearchService } from "./nibss-search.service";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { InitiateScanDto } from "./dto/initiate-scan.dto";
import { SubmitTemplateDto } from "./dto/submit-template.dto";
import { SelectBankProvisionDto } from "./dto/select-bank-provision.dto";
import { AuthorizeOperationDto } from "./dto/authorize-operation.dto";

/**
 * BIH — Biometric Identity Harvest & Instant Account Mint
 *
 * ACCOUNT_SETUP flow (3 steps):
 *   POST /v1/bih/scan          → prime session (returns scanRef)
 *   POST /v1/bih/:ref/template → submit FAP-20 minutiae → NIBSS 1:N → identity unlock
 *   POST /v1/bih/:ref/provision → select bank → zero-input CBS push → account minted ≤60s
 *
 * Multi-Functional Gate flow (2 steps):
 *   POST /v1/bih/scan          → prime session (WITHDRAWAL | TRANSFER | BILL_PAYMENT)
 *   POST /v1/bih/:ref/template → fingerprint match → identity unlocked
 *   POST /v1/bih/:ref/gate     → submit amount/recipient/biller → authorized
 *
 * Security: AES-256-GCM template encryption, SHA-256 hash audit, templatePurgedAt stamp.
 */
@ApiTags("bih")
@Controller("v1/bih")
export class BihController {
  constructor(
    private readonly scan:    BihScanService,
    private readonly gate:    BihGateService,
    private readonly nibss:   NibssSearchService,
    private readonly bankDir: BankDirectoryService,
  ) {}

  @ApiOperation({
    summary:
      "Step 0 — Prime a biometric scan session. Declare transaction type: " +
      "ACCOUNT_SETUP (Zero-Input Onboarding) or WITHDRAWAL / TRANSFER / BILL_PAYMENT (Multi-Functional Gate). " +
      "Returns scanRef. Client triggers FAP-20 / mobile sensor capture.",
  })
  @Post("scan")
  initiateScan(@Body() dto: InitiateScanDto) {
    return this.scan.initiateScan(dto);
  }

  @ApiOperation({
    summary:
      "Step 1 — Submit raw FAP-20 fingerprint minutiae (ISO 19794-2 WSQ, base64). " +
      "Server encrypts AES-256-GCM → NIBSS 1:N national registry search (sub-3s target). " +
      "On MatchFound: identity unlocked, encrypted shadow profile stored, template purged. " +
      "Returns read-only identity preview + National Bank Grid (for ACCOUNT_SETUP).",
  })
  @Post(":scanRef/template")
  submitTemplate(@Param("scanRef") scanRef: string, @Body() dto: SubmitTemplateDto) {
    return this.scan.submitTemplate(scanRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 2 (ACCOUNT_SETUP only) — Zero-Input Bank Selection + Account Minting. " +
      "STRICTLY no user-supplied Name/DOB/Address — NIBSS shadow profile is the Absolute Source of Truth. " +
      "Bank CBS receives NIBSS-verified data and issues account number within 60 seconds. " +
      "Audit log: NIBSS_Match_ID + Bank_Provisioning_Status + Account_Gen_Timestamp.",
  })
  @Post(":scanRef/provision")
  provision(@Param("scanRef") scanRef: string, @Body() dto: SelectBankProvisionDto) {
    return this.scan.selectBankAndProvision(scanRef, dto);
  }

  @ApiOperation({
    summary:
      "Multi-Functional Gate — Authorize WITHDRAWAL / TRANSFER / BILL_PAYMENT. " +
      "Fingerprint 1:N match (from /template step) is the primary authorization. " +
      "Submit operation-specific fields: amountMinor (all), recipientRef (TRANSFER), billerCode (BILL_PAYMENT). " +
      "Returns authorized operation result with NIBSS match reference.",
  })
  @Post(":scanRef/gate")
  gate(@Param("scanRef") scanRef: string, @Body() dto: AuthorizeOperationDto) {
    return this.gate.authorizeOperation(scanRef, dto);
  }

  @ApiOperation({ summary: "Poll scan session lifecycle status." })
  @Get(":scanRef/status")
  status(@Param("scanRef") scanRef: string, @Query("orgId") orgId = "default") {
    return this.scan.getSessionStatus(scanRef, orgId);
  }

  @ApiOperation({ summary: "List National Bank Grid — CBN/BoG licensed institutions." })
  @Get("directory/banks")
  banks() {
    return this.bankDir.listBanks();
  }
}

