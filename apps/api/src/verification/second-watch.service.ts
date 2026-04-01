import { Injectable, Logger } from "@nestjs/common";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { HsmBiometricService } from "../execution/hsm-biometric.service";

export interface SecondWatchResult {
  /** At least one NIBSS gate returned YES but the internal mirror template differs. Fraud signal. */
  secondWatchAlert: boolean;
  /** All three NIBSS gates returned Error — portal is unreachable; Watch Eye becomes primary. */
  nibssDown: boolean;
  /** Only set when nibssDown=true: whether the internal mirror confirmed at least one gate. */
  internalPrimaryConfirmed?: boolean;
}

/**
 * Second Watch Dual-Validation.
 *
 * For every transaction confirmation the system maintains two independent validators:
 *   1. NIBSS Portal   — the national biometric authority.
 *   2. Internal Watch Eye (TfanRecord) — the encrypted local mirror.
 *
 * Rules:
 *   - NIBSS portal down (all Error)  → internal Watch Eye becomes PRIMARY authorizer.
 *   - NIBSS YES on any gate          → cross-check that gate against the stored mirror.
 *     If mirror disagrees (different template) → secondWatchAlert = true (Sentinel fraud signal).
 */
@Injectable()
export class SecondWatchService {
  private readonly log = new Logger(SecondWatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hsm:    HsmBiometricService,
  ) {}

  async validate(params: {
    bvnHash:      string;
    fpTemplate?:  Buffer;
    faceTemplate?: Buffer;
    mobileNumber?: string;
    fpOutcome:    MatchOutcome;
    faceOutcome:  MatchOutcome;
    mobileOutcome: MatchOutcome;
  }): Promise<SecondWatchResult> {
    const tfan = await this.prisma.tfanRecord.findFirst({
      where: { bvnHash: params.bvnHash },
    });

    // No internal mirror yet (user not enrolled locally) — skip second watch
    if (!tfan) return { secondWatchAlert: false, nibssDown: false };

    const allError =
      params.fpOutcome    === MatchOutcome.Error &&
      params.faceOutcome  === MatchOutcome.Error &&
      params.mobileOutcome === MatchOutcome.Error;

    // ── NIBSS portal down → internal Watch Eye becomes primary authorizer ──
    if (allError) {
      const fpOk   = params.fpTemplate?.length
        ? await this.hsm.secureTemplateMatch(Buffer.from(tfan.fingerprintPacked), params.fpTemplate)
        : false;
      const faceOk = params.faceTemplate?.length
        ? await this.hsm.secureTemplateMatch(Buffer.from(tfan.facePacked), params.faceTemplate)
        : false;
      const mobOk  = params.mobileNumber?.length
        ? await this.hsm.secureMobileMatch(Buffer.from(tfan.mobilePacked), params.mobileNumber)
        : false;

      const confirmed = fpOk || faceOk || mobOk;
      this.log.warn(
        `[SecondWatch] NIBSS portal unreachable — Watch Eye primary: ` +
        `fp=${fpOk} face=${faceOk} mobile=${mobOk} confirmed=${confirmed}`,
      );
      return { secondWatchAlert: false, nibssDown: true, internalPrimaryConfirmed: confirmed };
    }

    // ── Cross-check: every NIBSS YES gate must agree with internal mirror ──
    let alert = false;

    if (params.fpOutcome === MatchOutcome.MatchFound && params.fpTemplate?.length) {
      const ok = await this.hsm.secureTemplateMatch(
        Buffer.from(tfan.fingerprintPacked), params.fpTemplate,
      );
      if (!ok) {
        this.log.warn("[SecondWatch] FINGERPRINT mismatch: NIBSS=YES but Watch Eye=NO — Sentinel alert");
        alert = true;
      }
    }

    if (params.faceOutcome === MatchOutcome.MatchFound && params.faceTemplate?.length) {
      const ok = await this.hsm.secureTemplateMatch(
        Buffer.from(tfan.facePacked), params.faceTemplate,
      );
      if (!ok) {
        this.log.warn("[SecondWatch] FACE mismatch: NIBSS=YES but Watch Eye=NO — Sentinel alert");
        alert = true;
      }
    }

    if (params.mobileOutcome === MatchOutcome.MatchFound && params.mobileNumber?.length) {
      const ok = await this.hsm.secureMobileMatch(
        Buffer.from(tfan.mobilePacked), params.mobileNumber,
      );
      if (!ok) {
        this.log.warn("[SecondWatch] MOBILE mismatch: NIBSS=YES but Watch Eye=NO — Sentinel alert");
        alert = true;
      }
    }

    return { secondWatchAlert: alert, nibssDown: false };
  }
}

