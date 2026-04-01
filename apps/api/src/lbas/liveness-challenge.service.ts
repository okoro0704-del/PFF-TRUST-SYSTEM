import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { LbasAuditService } from "./lbas-audit.service";
import type { IssueChallengeDto } from "./dto/issue-challenge.dto";
import type { SubmitLivenessDto, TaskProofDto } from "./dto/submit-liveness.dto";
import {
  EVT_LIVENESS_COMPLETED, EVT_LIVENESS_EXPIRED, EVT_LIVENESS_FAILED, EVT_LIVENESS_ISSUED,
  LIVENESS_CHALLENGE_TTL_S,
  LIVENESS_COMPLETED, LIVENESS_DEPTH_THRESHOLD, LIVENESS_EXPIRED,
  LIVENESS_FAILED, LIVENESS_MIN_FRAMES, LIVENESS_MIN_SCORE,
  LIVENESS_PENDING, LIVENESS_TASK_POOL,
} from "./lbas.constants";

@Injectable()
export class LivenessChallengeService {
  private readonly log = new Logger(LivenessChallengeService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly config:   ConfigService,
    private readonly nibss:    NibssFactory,
    private readonly liveness: StubLivenessService,
    private readonly audit:    LbasAuditService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /**
   * Issue a randomised liveness challenge.
   *
   * Anti-replay guarantees:
   *   - Task sequence is shuffled from the pool on every call.
   *   - Session token is a UUID — one-time use.
   *   - Challenge expires in LIVENESS_CHALLENGE_TTL_S seconds (default 90).
   *   - Task count is randomly 1–3 (weighted toward 2).
   */
  async issueChallenge(dto: IssueChallengeDto) {
    const orgId        = dto.orgId ?? "default";
    const customerHash = this.bvnHash(dto.customerBvn);
    await this.prisma.setOrgContext(orgId);

    // ── Randomised task selection ──────────────────────────────────────────
    const pool      = [...LIVENESS_TASK_POOL].sort(() => Math.random() - 0.5);
    const taskCount = Math.random() < 0.25 ? 1 : Math.random() < 0.65 ? 2 : 3;
    const tasks     = pool.slice(0, taskCount);

    const sessionToken = randomUUID();
    const now          = new Date();
    const expiresAt    = new Date(now.getTime() + LIVENESS_CHALLENGE_TTL_S * 1000);

    const challenge = await this.prisma.livenessChallenge.create({
      data: {
        sessionToken,
        customerBvnHash:  customerHash,
        taskSequenceJson: JSON.stringify(tasks),
        taskCount,
        status:           LIVENESS_PENDING,
        expiresAt,
        orgId,
      },
    });

    await this.audit.log({
      eventType:       EVT_LIVENESS_ISSUED,
      sessionRef:      sessionToken,
      customerBvnHash: customerHash,
      orgId,
      metadata:        { taskSequence: tasks, expiresAt: expiresAt.toISOString() },
    });

    return {
      sessionToken,
      taskSequence: tasks,
      taskCount,
      expiresAt:    expiresAt.toISOString(),
      ttlSeconds:   LIVENESS_CHALLENGE_TTL_S,
      instructions: tasks.map((t) => TASK_INSTRUCTIONS[t] ?? t),
      message:
        "Liveness challenge issued. Complete all tasks in sequence and submit optical-flow proof within the TTL.",
    };
  }

  /**
   * Validate optical-flow proof for each issued task, then run NIBSS face match.
   *
   * Validation per task:
   *   - livenessScore  ≥ LIVENESS_MIN_SCORE  (0.80)
   *   - depthVarianceScore ≥ LIVENESS_DEPTH_THRESHOLD (0.70)
   *   - frameCount ≥ LIVENESS_MIN_FRAMES (8)
   *
   * On all-tasks-pass → liveness check → NIBSS face match → Face_Match: YES / NO.
   */
  async submitProof(dto: SubmitLivenessDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    const session = await this.prisma.livenessChallenge.findUnique({
      where: { sessionToken: dto.sessionToken },
    });
    if (!session) throw new BadRequestException("Liveness session not found");
    if (session.orgId !== orgId) throw new BadRequestException("Org mismatch");

    // ── Expiry check ───────────────────────────────────────────────────────
    if (new Date() > session.expiresAt) {
      await this.prisma.livenessChallenge.update({
        where: { sessionToken: dto.sessionToken },
        data:  { status: LIVENESS_EXPIRED },
      });
      await this.audit.log({ eventType: EVT_LIVENESS_EXPIRED, sessionRef: dto.sessionToken, orgId });
      throw new BadRequestException("Liveness challenge has expired — issue a new challenge");
    }

    // ── Idempotency: already completed or failed ───────────────────────────
    if (session.status === LIVENESS_COMPLETED || session.status === LIVENESS_FAILED) {
      throw new BadRequestException(`Session already ${session.status}`);
    }

    // ── Verify task sequence matches ───────────────────────────────────────
    const issuedTasks: string[] = JSON.parse(session.taskSequenceJson) as string[];
    const submittedCodes = dto.taskProofs.map((p) => p.taskCode);
    const mismatched = issuedTasks.filter((t, i) => t !== submittedCodes[i]);
    if (mismatched.length || submittedCodes.length !== issuedTasks.length) {
      throw new BadRequestException(
        `Task sequence mismatch. Expected: ${issuedTasks.join(", ")}. Got: ${submittedCodes.join(", ")}`,
      );
    }

    // ── Per-task optical-flow validation ───────────────────────────────────
    const taskScores = dto.taskProofs.map((proof) => this.validateTaskProof(proof));
    const allPassed  = taskScores.every((s) => s.passed);

    if (!allPassed) {
      const failedTasks = taskScores.filter((s) => !s.passed).map((s) => s.taskCode);
      await this.prisma.livenessChallenge.update({
        where: { sessionToken: dto.sessionToken },
        data: {
          status:     LIVENESS_FAILED,
          scoresJson: JSON.stringify(taskScores),
          completedAt: new Date(),
        },
      });
      await this.audit.log({
        eventType: EVT_LIVENESS_FAILED, sessionRef: dto.sessionToken, orgId,
        metadata: { failedTasks, taskScores },
      });
      throw new BadRequestException({
        message: "Liveness check failed — optical-flow proof insufficient",
        failedTasks,
        taskScores,
      });
    }

    // ── Liveness pre-check (passive depth) ────────────────────────────────
    const faceBuf   = Buffer.from(dto.faceTemplateB64, "base64");
    const liveCheck = await this.liveness.verifyPassive(faceBuf);
    if (!liveCheck.pass) {
      await this.prisma.livenessChallenge.update({
        where: { sessionToken: dto.sessionToken },
        data: { status: LIVENESS_FAILED, faceMatchResult: false, completedAt: new Date() },
      });
      await this.audit.log({ eventType: EVT_LIVENESS_FAILED, sessionRef: dto.sessionToken, orgId,
        metadata: { reason: "passive-liveness-fail" } });
      throw new BadRequestException("Passive liveness check failed — suspected non-live face");
    }

    // ── NIBSS Face Match — final YES call ─────────────────────────────────
    const bundle   = this.nibss.create();
    const faceRes  = await bundle.biometric.verifyFace(session.customerBvnHash, faceBuf);
    const matched  = faceRes.outcome === MatchOutcome.MatchFound;
    const status   = matched ? LIVENESS_COMPLETED : LIVENESS_FAILED;

    await this.prisma.livenessChallenge.update({
      where: { sessionToken: dto.sessionToken },
      data: {
        status, faceMatchResult: matched,
        proofJson:  JSON.stringify({ taskProofs: dto.taskProofs }),
        scoresJson: JSON.stringify(taskScores),
        completedAt: new Date(),
      },
    });

    await this.audit.log({
      eventType:  matched ? EVT_LIVENESS_COMPLETED : EVT_LIVENESS_FAILED,
      sessionRef: dto.sessionToken,
      customerBvnHash: session.customerBvnHash, orgId,
      metadata: { taskScores, faceMatch: matched, nibssCorrelationId: faceRes.correlationId },
    });

    this.log.log(`[LBAS][liveness] sessionToken=${dto.sessionToken} faceMatch=${matched}`);

    return {
      sessionToken:   dto.sessionToken,
      facePay:        matched ? "YES" : "NO",
      faceMatchResult: matched,
      tasksVerified:  taskScores.length,
      taskScores,
      nibssCorrelationId: faceRes.correlationId,
    };
  }

  /** Per-task optical-flow proof validation against minimum thresholds. */
  private validateTaskProof(proof: TaskProofDto): {
    taskCode: string; passed: boolean; reason?: string;
    livenessScore: number; depthVarianceScore: number; frameCount: number;
  } {
    if (proof.livenessScore < LIVENESS_MIN_SCORE) {
      return { ...proof, passed: false, reason: `livenessScore ${proof.livenessScore} < ${LIVENESS_MIN_SCORE}` };
    }
    if (proof.depthVarianceScore < LIVENESS_DEPTH_THRESHOLD) {
      return { ...proof, passed: false, reason: `depthVarianceScore ${proof.depthVarianceScore} < ${LIVENESS_DEPTH_THRESHOLD}` };
    }
    if (proof.frameCount < LIVENESS_MIN_FRAMES) {
      return { ...proof, passed: false, reason: `frameCount ${proof.frameCount} < ${LIVENESS_MIN_FRAMES}` };
    }
    return { taskCode: proof.taskCode, passed: true, livenessScore: proof.livenessScore,
      depthVarianceScore: proof.depthVarianceScore, frameCount: proof.frameCount };
  }

  async getChallengeStatus(sessionToken: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.livenessChallenge.findUnique({ where: { sessionToken } });
    if (!s) throw new BadRequestException("Session not found");
    return {
      sessionToken, status: s.status,
      taskSequence: JSON.parse(s.taskSequenceJson) as string[],
      faceMatchResult: s.faceMatchResult,
      expiresAt: s.expiresAt, completedAt: s.completedAt,
    };
  }
}

/** Human-readable instructions for each liveness task (returned to client). */
const TASK_INSTRUCTIONS: Record<string, string> = {
  BLINK_TWICE:     "Please blink twice, slowly and naturally.",
  OPEN_MOUTH:      "Please open your mouth wide for 2 seconds.",
  HEAD_TURN_LEFT:  "Please turn your head 45 degrees to the left.",
  HEAD_TURN_RIGHT: "Please turn your head 45 degrees to the right.",
  SMILE:           "Please smile naturally for 2 seconds.",
  NOD:             "Please nod your head up and down twice.",
};

