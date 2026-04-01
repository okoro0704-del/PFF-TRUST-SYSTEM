import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { UnbankedCaptureService } from "./unbanked-capture.service";
import { NibssPushService } from "./nibss-push.service";
import { WatchEyeSyncService } from "./watch-eye-sync.service";
import { UnbankedEnrollDto } from "./dto/unbanked-enroll.dto";
import { NibssPushTriggerDto } from "./dto/nibss-push-trigger.dto";
import { NibssCallbackDto } from "./dto/nibss-callback.dto";
import { SyncMirrorDto } from "./dto/sync-mirror.dto";
import { ProfileEditDto } from "./dto/profile-edit.dto";

/**
 * Unbanked Capture & National Push API
 *
 * POST /v1/unbanked/enroll          — Full-spectrum biometric + demographic enrollment (no BVN required)
 * GET  /v1/unbanked/:tfanId/status  — Profile status: UNBANKED → NIBSS_SUBMITTED → BANKABLE
 * POST /v1/unbanked/push-nibss      — Trigger BVN generation pipeline (National Push)
 * POST /v1/unbanked/nibss-callback  — NIBSS Feedback Loop webhook (SUCCESS / DUPLICATE / ERROR)
 */
@ApiTags("unbanked")
@Controller("v1/unbanked")
export class UnbankedController {
  constructor(
    private readonly capture:      UnbankedCaptureService,
    private readonly nibssPush:    NibssPushService,
    private readonly watchEyeSync: WatchEyeSyncService,
  ) {}

  /**
   * Step 1 — Full-Spectrum Enrollment.
   * Accepts 10 fingerprints, HD face map, mobile, and NIBSS-required demographics.
   * Returns TFAN — the internal primary key while BVN is pending.
   */
  @ApiOperation({ summary: "Full-spectrum enrollment — 10 fingerprints, HD face, mobile, demographics (no BVN required)" })
  @Post("enroll")
  enroll(@Body() dto: UnbankedEnrollDto) {
    return this.capture.enrollUnbanked(dto);
  }

  /**
   * Step 2 — Poll profile status and submission history.
   */
  @ApiOperation({ summary: "Poll TFAN profile status: UNBANKED → NIBSS_SUBMITTED → BANKABLE" })
  @Get(":tfanId/status")
  status(
    @Param("tfanId") tfanId: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.capture.getProfile(tfanId, orgId);
  }

  /**
   * Step 3 — National Push: trigger the NIBSS BVN Generation Pipeline.
   * Packages biometrics + demographics into NIBSS format and submits for BVN creation.
   * Response is immediate (PENDING); result arrives via callback or poll.
   */
  @ApiOperation({ summary: "National Push — trigger NIBSS BVN generation pipeline" })
  @Post("push-nibss")
  pushNibss(@Body() dto: NibssPushTriggerDto) {
    return this.nibssPush.submitForBvn(
      dto.tfanId,
      dto.orgId ?? "default",
      dto.shardCountry ?? "NG",
    );
  }

  /**
   * Step 4 — NIBSS Feedback Loop.
   * Receives webhook from NIBSS / Sovereign Identity Gateway.
   * SUCCESS  → triggers Bankability Upgrade (TfanRecord mirror + Tier-1 account provisioning).
   * DUPLICATE → triggers Mirror Protocol (links existing national BVN to internal TFAN).
   * ERROR     → resets profile to UNBANKED for retry.
   */
  @ApiOperation({ summary: "NIBSS Feedback Loop webhook — SUCCESS upgrades to BANKABLE, ERROR resets for retry" })
  @Post("nibss-callback")
  nibssCallback(
    @Body() dto: NibssCallbackDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.nibssPush.handleCallback(dto, dto.orgId ?? orgId);
  }

  /**
   * Watch Eye Mirror Sync.
   * Intercepts any NIBSS YES response and appends the verified biometric gate(s)
   * to the immutable Watch Eye Supplemental Log.
   *
   * Rules:
   *   - TfanRecord (set at enrollment) is NEVER overwritten.
   *   - Each entry is independently AES-256-GCM encrypted with a fresh IV.
   *   - At least one gate (fingerprint | face | mobile) must be provided.
   */
  @ApiOperation({ summary: "Watch Eye Mirror Sync — append verified biometric gate(s) to the immutable Watch Eye log" })
  @Post("sync-mirror")
  syncMirror(
    @Body() dto: SyncMirrorDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.watchEyeSync.mirrorNibssYes({ ...dto, orgId: dto.orgId ?? orgId });
  }

  /**
   * Retrieve Watch Eye supplemental history for a given BVN (metadata only — no biometric blobs).
   */
  @ApiOperation({ summary: "Watch Eye supplemental history for a BVN — metadata only, no biometric blobs returned" })
  @Get("watch-eye/:bvn/history")
  watchEyeHistory(
    @Param("bvn") bvn: string,
    @Query("orgId") orgId = "default",
  ) {
    return this.watchEyeSync.supplementalHistory(bvn, orgId);
  }

  /**
   * Non-biometric profile edit — PATCH /v1/unbanked/:tfanId/profile
   * Editable: firstName, lastName, middleName, address, stateOfOrigin.
   * Permanently immutable: gender, dateOfBirth, all biometric blobs.
   * Blocked while status = NIBSS_SUBMITTED.
   */
  @ApiOperation({ summary: "Non-biometric profile edit — name/address corrections; blocked during NIBSS_SUBMITTED" })
  @Patch(":tfanId/profile")
  editProfile(
    @Param("tfanId") tfanId: string,
    @Body() dto: ProfileEditDto,
    @Query("orgId") orgId = "default",
  ) {
    return this.capture.editProfile(tfanId, { ...dto, orgId: dto.orgId ?? orgId });
  }

  /**
   * NIBSS retry — POST /v1/unbanked/:tfanId/retry-nibss
   * Re-submits a profile that returned to UNBANKED status after a NIBSS ERROR.
   * Simply calls the same submission pipeline — guard inside service ensures
   * status is UNBANKED (not NIBSS_SUBMITTED or BANKABLE).
   */
  @ApiOperation({ summary: "NIBSS retry — re-submit a profile that returned to UNBANKED after a NIBSS ERROR" })
  @Post(":tfanId/retry-nibss")
  retryNibss(
    @Param("tfanId") tfanId: string,
    @Query("orgId") orgId = "default",
    @Query("shardCountry") shardCountry = "NG",
  ) {
    return this.nibssPush.submitForBvn(tfanId, orgId, shardCountry as "NG" | "GH");
  }
}

