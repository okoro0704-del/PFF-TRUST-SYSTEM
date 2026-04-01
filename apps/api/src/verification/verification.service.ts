import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { encryptPayload, packEncryptedBlob } from "@bsss/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { PolicyEngineService } from "../policy/policy-engine.service";
import { SentinelService } from "../sentinel/sentinel.service";
import { StubLivenessService } from "../liveness/liveness.service";
import { SecondWatchService } from "./second-watch.service";
import type { TripleGateEnrollDto } from "./dto/enroll.dto";
import type { TransactionConfirmDto } from "./dto/confirm.dto";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly nibssFactory: NibssFactory,
    private readonly policy:       PolicyEngineService,
    private readonly sentinel:     SentinelService,
    private readonly liveness:     StubLivenessService,
    private readonly secondWatch:  SecondWatchService,
    private readonly config:       ConfigService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  private salt(): Buffer {
    const s = this.config.get<string>("BSSS_CRYPTO_SALT") ?? "bsss-salt-change-in-prod-32b!!";
    return Buffer.from(s.padEnd(32, "0").slice(0, 32));
  }

  private masterSecret(): string {
    return this.config.get<string>("BSSS_MASTER_SECRET") ?? "dev-master-secret-32-characters!";
  }

  private async runNibssTriples(bvnToken: string, fp: Uint8Array, face: Uint8Array, mobile: string) {
    const bundle = this.nibssFactory.create();
    const [fpRes, faceRes, mobRes] = await Promise.all([
      bundle.biometric.verifyFingerprint(bvnToken, fp),
      bundle.biometric.verifyFace(bvnToken, face),
      bundle.mobile.verifyMobile(bvnToken, mobile),
    ]);
    return { fpRes, faceRes, mobRes };
  }

  /** FR-01–03: all gates must return MatchFound before TFAN write. */
  async enrollTripleGate(dto: TripleGateEnrollDto) {
    const fp = Buffer.from(dto.fingerprintTemplateB64, "base64");
    const face = Buffer.from(dto.faceTemplateB64, "base64");
    const live = await this.liveness.verifyPassive(face);
    if (!live.pass) {
      throw new BadRequestException("Passive liveness failed");
    }
    const bvnToken = this.bvnHash(dto.bvn);
    const { fpRes, faceRes, mobRes } = await this.runNibssTriples(dto.bvn, fp, face, dto.mobileNumber);
    const outcomes = [fpRes.outcome, faceRes.outcome, mobRes.outcome];
    if (outcomes.some((o) => o !== MatchOutcome.MatchFound)) {
      throw new BadRequestException({
        message: "NIBSS verification failed for one or more gates",
        finger: fpRes.outcome,
        face: faceRes.outcome,
        mobile: mobRes.outcome,
      });
    }
    const secret = this.masterSecret();
    const salt = this.salt();
    const fpPacked = packEncryptedBlob(encryptPayload(fp, secret, salt));
    const facePacked = packEncryptedBlob(encryptPayload(face, secret, salt));
    const mobilePacked = packEncryptedBlob(
      encryptPayload(Buffer.from(dto.mobileNumber, "utf8"), secret, salt),
    );
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);
    const row = await this.prisma.tfanRecord.create({
      data: {
        bvnHash: bvnToken,
        fingerprintPacked: fpPacked,
        facePacked: facePacked,
        mobilePacked: mobilePacked,
        lastVerificationRef: fpRes.correlationId,
      },
    });
    await this.appendLedger({
      orgId,
      externalTransactionId: `enroll:${row.id}`,
      policyMode: "enroll_all_match",
      amountMinorUnits: 0n,
      currencyCode: "NGN",
      bvnHash: bvnToken,
      sentinelThresholdMinor: null,
      fpOutcome: fpRes.outcome,
      faceOutcome: faceRes.outcome,
      mobileOutcome: mobRes.outcome,
      aggregateConfirmed: true,
      mismatchAlert: false,
      nibssMetaJson: JSON.stringify({
        fp: fpRes.correlationId,
        face: faceRes.correlationId,
        mob: mobRes.correlationId,
      }),
    });
    return { tfanId_encrypted: row.id, bvnHash: bvnToken };
  }

  /**
   * FR-04 / FR-05 — Transaction Confirmation with Second Watch Dual-Validation.
   *
   * Flow:
   *   1. Passive liveness on face template.
   *   2. Sentinel threshold → decide OR-Gate vs AND-Gate policy.
   *   3. NIBSS triple-gate call (parallel).
   *   4. Second Watch: cross-check every NIBSS YES gate against internal Watch Eye mirror.
   *      - NIBSS portal down (all Error) → Watch Eye becomes PRIMARY authorizer.
   *      - NIBSS YES but mirror disagrees → secondWatchAlert=true (Sentinel fraud signal).
   *   5. Append immutable VerificationLedger row.
   */
  async confirmTransaction(dto: TransactionConfirmDto) {
    const fp   = Buffer.from(dto.fingerprintTemplateB64, "base64");
    const face = Buffer.from(dto.faceTemplateB64, "base64");
    const live = await this.liveness.verifyPassive(face);
    if (!live.pass) throw new BadRequestException("Passive liveness failed");

    const amount    = BigInt(dto.amountMinorUnits);
    const threshold = await this.sentinel.getThreshold(dto.currencyCode);
    const mode      = this.policy.decidePolicyMode(amount, threshold.andGateThresholdMinorUnits);
    const bvnH      = this.bvnHash(dto.bvn);
    const orgId     = dto.orgId ?? "default";

    const { fpRes, faceRes, mobRes } = await this.runNibssTriples(dto.bvn, fp, face, dto.mobileNumber);

    // ── Second Watch Dual-Validation ────────────────────────────────────────
    const watch = await this.secondWatch.validate({
      bvnHash:       bvnH,
      fpTemplate:    fp,
      faceTemplate:  face,
      mobileNumber:  dto.mobileNumber,
      fpOutcome:     fpRes.outcome,
      faceOutcome:   faceRes.outcome,
      mobileOutcome: mobRes.outcome,
    });

    // When portal is down, use internal Watch Eye results as effective gate outcomes
    let effectiveFp   = fpRes.outcome;
    let effectiveFace = faceRes.outcome;
    let effectiveMob  = mobRes.outcome;
    if (watch.nibssDown && watch.internalPrimaryConfirmed !== undefined) {
      effectiveFp   = watch.internalPrimaryConfirmed ? MatchOutcome.MatchFound : MatchOutcome.NoMatch;
      effectiveFace = MatchOutcome.Error;
      effectiveMob  = MatchOutcome.Error;
    }

    const gates         = this.policy.gatesFromTriples(effectiveFp, effectiveFace, effectiveMob);
    const confirmed     = this.policy.aggregateConfirm(mode, gates);
    const mismatchAlert = this.policy.detectMismatch(gates) || watch.secondWatchAlert;

    await this.appendLedger({
      orgId,
      externalTransactionId: dto.externalTransactionId,
      policyMode:            watch.nibssDown ? `${mode}_watch_eye_primary` : mode,
      amountMinorUnits:      amount,
      currencyCode:          dto.currencyCode,
      sentinelThresholdMinor: threshold.andGateThresholdMinorUnits,
      fpOutcome:     effectiveFp,
      faceOutcome:   effectiveFace,
      mobileOutcome: effectiveMob,
      aggregateConfirmed: confirmed,
      mismatchAlert,
      bvnHash: bvnH,
      nibssMetaJson: JSON.stringify({
        fp:   fpRes.correlationId,
        face: faceRes.correlationId,
        mob:  mobRes.correlationId,
        nibssPortalDown:  watch.nibssDown,
        secondWatchAlert: watch.secondWatchAlert,
      }),
    });

    // ── BVN Consecutive-Failure Rate Limiter ────────────────────────────────
    if (!confirmed) {
      await this.checkBvnFailureRate(bvnH, orgId, dto.externalTransactionId);
    }

    return {
      confirmed,
      policyMode:       watch.nibssDown ? `${mode}_watch_eye_primary` : mode,
      gates:            { fingerprint: effectiveFp, face: effectiveFace, mobile: effectiveMob },
      mismatchAlert,
      nibssPortalDown:  watch.nibssDown,
      secondWatchAlert: watch.secondWatchAlert,
    };
  }

  /**
   * Queries the last BVN_FAILURE_WINDOW_COUNT ledger entries for this BVN hash.
   * If ALL are failed confirmations, fires a Sentinel alert.
   * Window: 60 minutes, threshold: 5 consecutive failures.
   */
  private async checkBvnFailureRate(
    bvnHash: string,
    orgId: string,
    lastTxId: string,
  ): Promise<void> {
    const THRESHOLD    = parseInt(this.config.get<string>("BVN_FAILURE_THRESHOLD") ?? "5", 10);
    const WINDOW_MIN   = parseInt(this.config.get<string>("BVN_FAILURE_WINDOW_MIN") ?? "60", 10);
    const windowStart  = new Date(Date.now() - WINDOW_MIN * 60 * 1000);

    const recent = await this.prisma.verificationLedger.findMany({
      where: {
        bvnHash,
        orgId,
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: "desc" },
      take: THRESHOLD,
      select: { aggregateConfirmed: true },
    });

    // Only alert when we have enough entries and every one is a failure
    if (
      recent.length >= THRESHOLD &&
      recent.every((r) => !r.aggregateConfirmed)
    ) {
      await this.sentinel.reportBvnConsecutiveFailures({
        bvnHash,
        orgId,
        consecutiveFailures:       recent.length,
        windowMinutes:             WINDOW_MIN,
        lastExternalTransactionId: lastTxId,
      });
    }
  }

  private async appendLedger(params: {
    orgId: string;
    externalTransactionId: string;
    policyMode: string;
    amountMinorUnits: bigint;
    currencyCode: string;
    sentinelThresholdMinor?: bigint | null;
    fpOutcome: string;
    faceOutcome: string;
    mobileOutcome: string;
    aggregateConfirmed: boolean;
    mismatchAlert: boolean;
    nibssMetaJson: string | null;
    bvnHash?: string;
  }) {
    await this.prisma.setOrgContext(params.orgId);
    await this.prisma.verificationLedger.create({
      data: {
        orgId: params.orgId,
        externalTransactionId: params.externalTransactionId,
        policyMode: params.policyMode,
        amountMinorUnits: new Decimal(params.amountMinorUnits.toString()),
        currencyCode: params.currencyCode,
        sentinelThresholdMinor:
          params.sentinelThresholdMinor == null
            ? null
            : new Decimal(params.sentinelThresholdMinor.toString()),
        fpOutcome: params.fpOutcome,
        faceOutcome: params.faceOutcome,
        mobileOutcome: params.mobileOutcome,
        aggregateConfirmed: params.aggregateConfirmed,
        mismatchAlert: params.mismatchAlert,
        nibssMetaJson: params.nibssMetaJson,
        bvnHash: params.bvnHash ?? null,
      },
    });
  }
}
