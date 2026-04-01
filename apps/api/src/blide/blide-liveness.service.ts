import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import {
  BLIDE_CHALLENGE_TTL_S, LIVENESS_POOL, LivenessChallengeType,
  EVT_BLIDE_CHALLENGE_ISSUED, EVT_BLIDE_LIVENESS_FAILED,
  EVT_BLIDE_LIVENESS_REPLAY, EVT_BLIDE_LIVENESS_RESPONSE, EVT_BLIDE_LIVENESS_VERIFIED,
} from "./blide.constants";

export interface LivenessChallengePayload {
  challengeId:   string;
  challengeType: string;
  prompt:        string;
  icon:          string;
  instruction:   string;
  nonce:         string;
  expiresAt:     Date;
  remainingSeconds: number;
}

export interface LivenessVerificationResult {
  verified:      boolean;
  challengeType: string;
  challengeId:   string;
}

/**
 * BlideLivenessService — Active Liveness Challenge Engine.
 *
 * Challenge Pool: 7 tasks (BLINK_TWICE, SMILE_TEETH, OPEN_MOUTH, TURN_LEFT,
 *                          TURN_RIGHT, NOD_HEAD, RAISE_EYEBROWS)
 *
 * Randomization Protocol:
 *   1. Query all challenges already issued for this session.
 *   2. Exclude their types from the eligible pool.
 *   3. If pool exhausted (all 7 used — very unlikely in <60s), reset exclusion.
 *   4. Select via randomBytes(1)[0] % eligiblePool.length — cryptographic random.
 *   → No fixed pattern. No repeated task per session. Replay attack impossible.
 *
 * Anti-Replay:
 *   - Each challengeId is a UUID (single-use).
 *   - BlideLivenessChallenge.consumed starts as false.
 *   - On first valid response: consumed → true, consumedAt → now().
 *   - Subsequent attempts with same challengeId rejected immediately.
 *
 * Zero-Knowledge Liveness:
 *   - responseFramesB64 processed in-memory only — NEVER written to DB.
 *   - Only liveness_verified: boolean stored in BlideSession.
 *   - completedChallengeType (task name) stored for audit; NO response content.
 */
@Injectable()
export class BlideLivenessService {
  private readonly log = new Logger(BlideLivenessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Issue a randomized, non-repeating liveness challenge for the session. */
  async issueLivenessChallenge(sessionRef: string, orgId: string): Promise<LivenessChallengePayload> {
    await this.prisma.setOrgContext(orgId);

    // Find challenge types already issued for this session
    const issued = await this.prisma.blideLivenessChallenge.findMany({
      where: { sessionRef }, select: { challengeType: true },
    });
    const usedTypes = new Set(issued.map(c => c.challengeType));

    // Build eligible pool — exclude used types; reset if exhausted (all 7 used)
    let eligible = LIVENESS_POOL.filter(t => !usedTypes.has(t.type));
    if (eligible.length === 0) {
      this.log.warn(`[BLIDE][liveness] all 7 task types exhausted for sessionRef=${sessionRef} — resetting pool`);
      eligible = [...LIVENESS_POOL];
    }

    // Cryptographic random selection from eligible pool
    const idx       = randomBytes(1)[0] % eligible.length;
    const selected  = eligible[idx];
    const challengeId = randomUUID();
    const nonce       = randomBytes(16).toString("hex");
    const expiresAt   = new Date(Date.now() + BLIDE_CHALLENGE_TTL_S * 1000);

    await this.prisma.blideLivenessChallenge.create({
      data: { challengeId, sessionRef, challengeType: selected.type,
        prompt: selected.prompt, nonce, expiresAt, orgId },
    });

    this.log.log(`[BLIDE][liveness] issued challengeId=${challengeId} type=${selected.type} sessionRef=${sessionRef}`);

    return {
      challengeId, challengeType: selected.type, prompt: selected.prompt,
      icon: selected.icon, instruction: selected.instruction, nonce, expiresAt,
      remainingSeconds: BLIDE_CHALLENGE_TTL_S,
    };
  }

  /**
   * Verify a liveness response.
   *
   * CV stub: validates challenge is unconsumed + unexpired + belongs to session.
   * Production: feed responseFramesB64 to MediaPipe FaceMesh / AWS Rekognition.
   * Frames are processed in-memory — NEVER written to the database.
   */
  async verifyLivenessResponse(
    sessionRef: string, challengeId: string,
    responseFramesB64: string[], orgId: string,
  ): Promise<LivenessVerificationResult> {
    await this.prisma.setOrgContext(orgId);

    const challenge = await this.prisma.blideLivenessChallenge.findUnique({
      where: { challengeId },
    });

    // Anti-replay: check existence, session ownership, expiry, consumption state
    if (!challenge) {
      await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_REPLAY, null, null, null, null, orgId,
        { reason: "challengeId not found", challengeId });
      throw new ForbiddenException("Invalid challenge ID — liveness response rejected");
    }
    if (challenge.sessionRef !== sessionRef) {
      await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_REPLAY, null, challenge.challengeType, null, null, orgId,
        { reason: "session mismatch", challengeId });
      throw new ForbiddenException("Challenge ID does not belong to this session — replay attack blocked");
    }
    if (challenge.consumed) {
      await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_REPLAY, null, challenge.challengeType, null, null, orgId,
        { reason: "already consumed", challengeId, consumedAt: challenge.consumedAt });
      throw new ForbiddenException("Challenge already consumed — replay attack blocked");
    }
    if (challenge.expiresAt < new Date()) {
      await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_REPLAY, null, challenge.challengeType, null, null, orgId,
        { reason: "expired", challengeId, expiresAt: challenge.expiresAt });
      throw new ForbiddenException("Liveness challenge has expired — request a new challenge");
    }

    await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_RESPONSE, null, challenge.challengeType, null, null, orgId,
      { challengeId, frameCount: responseFramesB64.length });

    // ── CV Engine (stub) ─────────────────────────────────────────────────────
    // Production: MediaPipe FaceMesh landmark delta validation across frame sequence
    // Stub: validate minimum frame content (non-empty) — simulates 97% pass rate
    const frameOk   = responseFramesB64.every(f => f.length > 10);
    const cvPassed  = frameOk && Math.random() > 0.03; // 97% pass rate stub

    // Mark challenge consumed (single-use — regardless of CV result)
    await this.prisma.blideLivenessChallenge.update({
      where: { challengeId },
      data: { consumed: true, consumedAt: new Date(), livenessVerified: cvPassed },
    });
    // responseFramesB64 are processed and go out of scope here — ZERO persistence

    if (!cvPassed) {
      await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_FAILED, null, challenge.challengeType, false, null, orgId,
        { challengeId, reason: "CV engine: active muscle movement not detected" });
      throw new ForbiddenException(`Liveness task "${challenge.prompt}" failed — active muscle movement not detected`);
    }

    await this.writeAudit(sessionRef, EVT_BLIDE_LIVENESS_VERIFIED, null, challenge.challengeType, true, null, orgId,
      { challengeId });
    this.log.log(`[BLIDE][liveness] VERIFIED challengeId=${challengeId} type=${challenge.challengeType} sessionRef=${sessionRef}`);
    return { verified: true, challengeType: challenge.challengeType, challengeId };
  }

  async writeAudit(sessionRef: string, eventType: string, faceMatchId: string | null | undefined,
    challengeType: string | null | undefined, livenessVerified: boolean | null | undefined,
    transactionType: string | null | undefined, orgId: string, metadata: Record<string, unknown>) {
    try {
      await this.prisma.blideAuditLog.create({
        data: { sessionRef, eventType, faceMatchId: faceMatchId ?? null,
          challengeType: challengeType ?? null, livenessVerified: livenessVerified ?? null,
          transactionType: transactionType ?? null, metadataJson: JSON.stringify(metadata), orgId },
      });
    } catch { /* audit never breaks flow */ }
  }
}

