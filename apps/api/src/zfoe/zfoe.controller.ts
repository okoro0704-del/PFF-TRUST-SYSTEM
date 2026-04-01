import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { NibssHarvestService } from "./nibss-harvest.service";
import { AccountProvisionService } from "./account-provision.service";
import { InitiateHarvestDto } from "./dto/initiate-harvest.dto";
import { SelectBankDto } from "./dto/select-bank.dto";
import { AuthorizeProvisionDto } from "./dto/authorize-provision.dto";
import { BankDirectoryService } from "./bank-directory.service";

/**
 * ZFOE — Zero-Friction Instant Onboarding Engine
 *
 * Three-step protocol:
 *   Step 1: POST /v1/zfoe/harvest           — MSISDN → NIBSS identity mirror → Shadow Profile
 *   Step 2: POST /v1/zfoe/:ref/bank         — Bank + account type selection
 *   Step 3: POST /v1/zfoe/:ref/provision    — Biometric gate → CBS push → account number (≤60s)
 */
@ApiTags("zfoe")
@Controller("v1/zfoe")
export class ZfoeController {
  constructor(
    private readonly harvest:    NibssHarvestService,
    private readonly provision:  AccountProvisionService,
    private readonly bankDir:    BankDirectoryService,
  ) {}

  @ApiOperation({
    summary:
      "Step 1 — One-Touch MSISDN Harvest: resolve BVN-linked MSISDN against the NIBSS National Identity " +
      "Mirror. Returns an encrypted Shadow Profile preview (name, DOB, state — no BVN, no raw biometric) " +
      "and the full National Bank Grid for selection.",
  })
  @Post("harvest")
  initiateHarvest(@Body() dto: InitiateHarvestDto) {
    return this.harvest.initiateHarvest(dto);
  }

  @ApiOperation({
    summary: "Step 2 — Select bank from the National Bank Grid and choose account type (SAVINGS | CURRENT).",
  })
  @Post(":sessionRef/bank")
  selectBank(@Param("sessionRef") sessionRef: string, @Body() dto: SelectBankDto) {
    return this.harvest.selectBank(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 3 — Biometric Authorization + Account Minting: submit Face or FAP-20 Fingerprint template. " +
      "NIBSS gate validates. On MatchFound: CBS push → account number issued within 60-second mandate. " +
      "elapsedMs and mandateMet are logged in ZfoeAuditLog (NIBSS_Token_ID + Bank_API_Response + Timestamp).",
  })
  @Post(":sessionRef/provision")
  provision(
    @Param("sessionRef") sessionRef: string,
    @Body() dto: AuthorizeProvisionDto,
  ) {
    return this.provision.authorizeAndProvision(sessionRef, dto);
  }

  @ApiOperation({ summary: "Get session status and decrypted identity preview (no sensitive fields)." })
  @Get(":sessionRef/status")
  status(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.harvest.getSessionPreview(sessionRef, orgId);
  }

  @ApiOperation({ summary: "List all CBN/BoG licensed banks in the National Bank Directory." })
  @Get("directory/banks")
  listBanks() {
    return this.bankDir.listBanks();
  }
}

