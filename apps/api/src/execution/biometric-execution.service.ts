import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { decryptPayload, unpackEncryptedBlob } from "@bsss/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { HsmBiometricService } from "./hsm-biometric.service";
import { ExecutionProofService, type ProofPayload } from "./execution-proof.service";
import { bvnHashFromConfig, cryptoSalt, masterSecret } from "./crypto-env";

export type BiometricInline = {
  fingerprintTemplateB64?: string;
  faceTemplateB64?: string;
  mobileNumber?: string;
};

/**
 * Triple-gate execution:
 * - BVN (online): NIBSS Fingerprint | Face | Push/ICAD — ANY ONE MatchFound = YES.
 * - BVN (offline / Pulse): AES-GCM TFAN local cache — ANY ONE template match = YES.
 * - Non-BVN: three internal ciphertexts (fingerprints bundle, face, mobile) — ANY ONE = YES.
 */
@Injectable()
export class BiometricExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nibss: NibssFactory,
    private readonly liveness: StubLivenessService,
    private readonly hsm: HsmBiometricService,
    private readonly proof: ExecutionProofService,
    private readonly config: ConfigService,
  ) {}

  /** Transfer / withdraw / bills: stateless API — default requires fresh `biometricValidationHash` only (no PIN/password). */
  async authorizeExecutionOperation(params: {
    online: boolean;
    debitAccountPublicRef: string;
    bvn?: string;
    inline?: BiometricInline;
    validationHash?: string;
    proofScopes: string[];
  }): Promise<{ audit: Record<string, unknown>; proofSubject: ProofPayload | null }> {
    if (this.requireHashOnly()) {
      if (!params.validationHash) {
        throw new UnauthorizedException(
          "biometricValidationHash required — obtain via POST /execution/mint-validation-hash after a successful NIBSS or internal YES call",
        );
      }
      const p = this.proof.verify(params.validationHash, params.proofScopes, params.debitAccountPublicRef);
      return {
        audit: { path: "biometric_validation_hash", typ: p.typ, sub: p.sub },
        proofSubject: p,
      };
    }
    return this.performLiveYesGate(params);
  }

  /** Mint endpoint only: full live biometric YES, then issue HMAC validation hash. */
  async mintValidationHash(dto: {
    accountPublicRef: string;
    bvn?: string;
    online?: boolean;
    biometrics?: BiometricInline;
  }) {
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { publicRef: dto.accountPublicRef },
      include: { internalSubject: true },
    });
    if (!acc) throw new BadRequestException("Account not found");
    const online = dto.online !== false;
    await this.performLiveYesGate({
      online,
      debitAccountPublicRef: dto.accountPublicRef,
      bvn: dto.bvn,
      inline: dto.biometrics,
      validationHash: undefined,
      proofScopes: [],
    });
    const typ: "bvn" | "internal" = acc.ownerInternalSubjectId ? "internal" : "bvn";
    const sub =
      acc.ownerInternalSubjectId && acc.internalSubject
        ? acc.internalSubject.publicSubjectId
        : acc.ownerBvnHash ?? "";
    const expSec = Number(this.config.get("EXECUTION_HASH_TTL_SEC") ?? 90);
    const biometricValidationHash = this.proof.mint({
      sub,
      typ,
      scopes: ["execute", "withdraw", "pay"],
      ap: dto.accountPublicRef,
      expSec,
    });
    return { biometricValidationHash, expiresInSec: expSec };
  }

  private requireHashOnly(): boolean {
    return this.config.get<string>("EXECUTION_REQUIRE_HASH_ONLY") !== "false";
  }

  private async performLiveYesGate(params: {
    online: boolean;
    debitAccountPublicRef: string;
    bvn?: string;
    inline?: BiometricInline;
    validationHash?: string;
    proofScopes: string[];
  }): Promise<{ audit: Record<string, unknown>; proofSubject: ProofPayload | null }> {
    if (params.validationHash) {
      const p = this.proof.verify(params.validationHash, params.proofScopes, params.debitAccountPublicRef);
      return { audit: { path: "stateless_hash", typ: p.typ, sub: p.sub }, proofSubject: p };
    }
    const acc = await this.prisma.ledgerAccount.findUnique({
      where: { publicRef: params.debitAccountPublicRef },
    });
    if (!acc) throw new BadRequestException("Debit account not found");

    if (!params.inline || !this.hasAnyGate(params.inline)) {
      throw new BadRequestException("Provide biometricValidationHash or inline biometric samples");
    }

    const faceBuf = params.inline.faceTemplateB64?.length
      ? Buffer.from(params.inline.faceTemplateB64, "base64")
      : undefined;
    if (faceBuf?.length) {
      const live = await this.liveness.verifyPassive(faceBuf);
      if (!live.pass) throw new UnauthorizedException("Passive liveness failed");
    }

    const fp = params.inline.fingerprintTemplateB64?.length
      ? Buffer.from(params.inline.fingerprintTemplateB64, "base64")
      : undefined;
    const mobile = params.inline.mobileNumber?.trim();

    if (acc.ownerInternalSubjectId) {
      const hit = await this.matchInternalSubject(acc.ownerInternalSubjectId, fp, faceBuf, mobile);
      if (hit.yes) {
        return {
          audit: { gate: "internal_registry", channel: hit.channel, pulse: !params.online },
          proofSubject: null,
        };
      }
      throw new UnauthorizedException("Internal biometric YES failed (face | mobile | fingerprint bundle)");
    }

    if (acc.ownerBvnHash) {
      const tfan = await this.prisma.tfanRecord.findFirst({ where: { bvnHash: acc.ownerBvnHash } });
      if (!tfan) throw new BadRequestException("Owner TFAN missing");
      if (params.online) {
        const bvn = params.bvn;
        if (!bvn || bvnHashFromConfig(this.config, bvn) !== acc.ownerBvnHash) {
          throw new BadRequestException("BVN must match account owner for NIBSS YES call");
        }
        const ok = await this.nibssTripleAnyYes(bvn, fp, faceBuf, mobile);
        if (ok) return { audit: { gate: "nibss_bvn_portal_or", channels: ["fingerprint", "face", "push_icad"] }, proofSubject: null };
        throw new UnauthorizedException("NIBSS YES failed — no channel returned MatchFound");
      }
      const local = await this.matchTfanRecord(
        {
          fingerprintPacked: Buffer.from(tfan.fingerprintPacked),
          facePacked: Buffer.from(tfan.facePacked),
          mobilePacked: Buffer.from(tfan.mobilePacked),
        },
        fp,
        faceBuf,
        mobile,
      );
      if (local.yes) {
        return { audit: { gate: "tfan_local_cache", channel: local.channel, pulse: true }, proofSubject: null };
      }
      throw new UnauthorizedException("Offline biometric match against TFAN failed");
    }

    throw new BadRequestException("Account has no biometric owner linkage");
  }

  private hasAnyGate(i: BiometricInline): boolean {
    return !!(i.fingerprintTemplateB64?.length || i.faceTemplateB64?.length || i.mobileNumber?.trim()?.length);
  }

  /** NIBSS: Fingerprint + Face + Push (ICAD mobile) — parallel calls; ANY ONE MatchFound. */
  private async nibssTripleAnyYes(bvn: string, fp?: Buffer, face?: Buffer, mobile?: string): Promise<boolean> {
    const bundle = this.nibss.create();
    const tasks: Promise<MatchOutcome>[] = [];
    if (fp?.length) tasks.push(bundle.biometric.verifyFingerprint(bvn, fp).then((r) => r.outcome));
    if (face?.length) tasks.push(bundle.biometric.verifyFace(bvn, face).then((r) => r.outcome));
    if (mobile?.length) tasks.push(bundle.mobile.verifyMobile(bvn, mobile).then((r) => r.outcome));
    if (!tasks.length) return false;
    const outcomes = await Promise.all(tasks);
    return outcomes.some((o) => o === MatchOutcome.MatchFound);
  }

  private async matchTfanRecord(
    tfan: { fingerprintPacked: Buffer; facePacked: Buffer; mobilePacked: Buffer },
    fp?: Buffer,
    face?: Buffer,
    mobile?: string,
  ): Promise<{ yes: boolean; channel?: string }> {
    if (fp?.length && (await this.hsm.secureTemplateMatch(tfan.fingerprintPacked, fp))) {
      return { yes: true, channel: "fingerprint" };
    }
    if (face?.length && (await this.hsm.secureTemplateMatch(tfan.facePacked, face))) {
      return { yes: true, channel: "face" };
    }
    if (mobile?.length && (await this.hsm.secureMobileMatch(tfan.mobilePacked, mobile))) {
      return { yes: true, channel: "push_mobile" };
    }
    return { yes: false };
  }

  private async matchInternalSubject(
    subjectDbId: string,
    fp?: Buffer,
    face?: Buffer,
    mobile?: string,
  ): Promise<{ yes: boolean; channel?: string }> {
    const sub = await this.prisma.internalBiometricSubject.findUnique({
      where: { id: subjectDbId },
      include: { fingerprintSlots: true },
    });
    if (!sub) return { yes: false };

    if (sub.fingerprintsBundlePacked && Buffer.from(sub.fingerprintsBundlePacked).length > 0 && fp?.length) {
      const secret = masterSecret(this.config);
      const salt = cryptoSalt(this.config);
      const blob = unpackEncryptedBlob(Buffer.from(sub.fingerprintsBundlePacked));
      let plain: Buffer;
      try {
        plain = decryptPayload(blob, secret, salt);
      } catch {
        plain = Buffer.alloc(0);
      }
      try {
        const doc = JSON.parse(plain.toString("utf8")) as { v: number; templates: string[] };
        for (const tB64 of doc.templates ?? []) {
          const ref = Buffer.from(tB64, "base64");
          if (ref.length === fp.length && timingSafeEqual(ref, fp)) {
            return { yes: true, channel: "fingerprint_bundle" };
          }
        }
      } catch {
        /* fall through to legacy slots */
      }
    }

    if (mobile?.length && (await this.hsm.secureMobileMatch(Buffer.from(sub.mobilePacked), mobile))) {
      return { yes: true, channel: "mobile" };
    }
    if (face?.length && (await this.hsm.secureTemplateMatch(Buffer.from(sub.facePacked), face))) {
      return { yes: true, channel: "face" };
    }
    if (fp?.length) {
      for (const slot of sub.fingerprintSlots) {
        if (await this.hsm.secureTemplateMatch(Buffer.from(slot.fingerprintPacked), fp)) {
          return { yes: true, channel: `fingerprint_slot_${slot.slotIndex}` };
        }
      }
    }
    return { yes: false };
  }
}
