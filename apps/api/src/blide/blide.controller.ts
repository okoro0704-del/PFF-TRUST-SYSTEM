import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BlideExecutionService } from "./blide-execution.service";
import { InitiateSessionDto } from "./dto/initiate-session.dto";
import { SubmitFaceTemplateDto } from "./dto/submit-face-template.dto";
import { SelectTargetDto } from "./dto/select-target.dto";
import { SubmitLivenessResponseDto } from "./dto/submit-liveness-response.dto";

/**
 * BLIDE — Biometric Liveness & Identity Discovery Engine
 *
 * Active-Liveness Face Pay Protocol — all four transaction types.
 *
 * Four-step flow:
 *
 *   Step 0: POST /v1/blide/initiate  { transactionType }
 *           Prime session. Camera activates immediately.
 *
 *   Step 1: POST /v1/blide/:ref/face  { rawFaceTemplateB64, faceFormat }
 *           AES-256-GCM encrypt face frame → NIBSS 1:N face registry search.
 *           On match: identity/account map built + encrypted at rest. Frame purged.
 *           Returns: identity preview (Account Setup) OR masked account cards (Financial).
 *
 *   Step 2: POST /v1/blide/:ref/select  { bankCode/accountRef + amount }
 *           Target selection. Server issues randomized Liveness Challenge (7-task pool,
 *           cryptographically random, non-repeating per session, single-use challengeId).
 *           Returns: { challengeId, challengeType, prompt, icon, instruction, expiresAt }.
 *
 *   Step 3: POST /v1/blide/:ref/liveness  { challengeId, responseFramesB64[] }
 *           CV engine validates active muscle movement (stub: frame non-empty + 97% pass).
 *           Anti-replay: challengeId consumed on first use — replay blocked server-side.
 *           Zero-knowledge: frames processed in-memory, ONLY liveness_verified:TRUE stored.
 *           On pass: transaction executed, account map zeroed, session completed.
 *           Compliance: faceMatchId + livenessVerified + challengeType in audit log.
 */
@ApiTags("blide")
@Controller("v1/blide")
export class BlideController {
  constructor(private readonly exec: BlideExecutionService) {}

  @ApiOperation({
    summary:
      "Step 0 — Initiate BLIDE Face Pay session. Declare transaction type. " +
      "Returns sessionRef. Client activates camera immediately.",
  })
  @Post("initiate")
  initiate(@Body() dto: InitiateSessionDto) {
    return this.exec.initiate(dto);
  }

  @ApiOperation({
    summary:
      "Step 1 — Submit face frame (ISO 19794-5 / JPEG / HEIF). " +
      "AES-256-GCM encrypted before NIBSS 1:N face registry search (sub-3s target). " +
      "On match: identity unlocked (Account Setup) or account map built sorted DESC by balance. " +
      "Frame purged immediately; SHA-256 hash retained for audit.",
  })
  @Post(":sessionRef/face")
  submitFace(@Param("sessionRef") sessionRef: string, @Body() dto: SubmitFaceTemplateDto) {
    return this.exec.submitFaceTemplate(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 2 — Select target: bank+accountType (Account Setup) or accountRef+amount+recipient/biller (Financial). " +
      "Server issues randomized Liveness Challenge from 7-task pool. " +
      "Task randomization: cryptographic random, non-repeating per session, single-use UUID. " +
      "Returns challenge with 30-second window.",
  })
  @Post(":sessionRef/select")
  selectTarget(@Param("sessionRef") sessionRef: string, @Body() dto: SelectTargetDto) {
    return this.exec.selectTarget(sessionRef, dto);
  }

  @ApiOperation({
    summary:
      "Step 3 — Submit Liveness Response (challengeId + 1-5 response frames). " +
      "Anti-replay: challengeId single-use, consumed on first call. " +
      "CV validates active muscle movement. Zero-knowledge: frames never stored. " +
      "On pass: transaction executed, account map zeroed. " +
      "Audit: faceMatchId + Liveness_Verified:TRUE + challengeType.",
  })
  @Post(":sessionRef/liveness")
  submitLiveness(@Param("sessionRef") sessionRef: string, @Body() dto: SubmitLivenessResponseDto) {
    return this.exec.submitLivenessResponse(sessionRef, dto);
  }

  @ApiOperation({ summary: "Poll BLIDE session status (faceMatchId, livenessVerified, elapsedMs, mandateMet)." })
  @Get(":sessionRef/status")
  status(@Param("sessionRef") sessionRef: string, @Query("orgId") orgId = "default") {
    return this.exec.getStatus(sessionRef, orgId);
  }
}

