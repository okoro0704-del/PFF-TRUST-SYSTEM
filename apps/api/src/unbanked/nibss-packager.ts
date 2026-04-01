import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { decryptPayload, unpackEncryptedBlob } from "@bsss/crypto";
import { cryptoSalt, masterSecret } from "../execution/crypto-env";
import type { InternalBiometricSubject, UnbankedProfile } from "@prisma/client";

export interface NibssApplicant {
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;     // YYYY-MM-DD
  gender: string;          // "M" | "F"
  address: string;
  stateOfOrigin: string;
  mobile: string;
}

export interface NibssEnrollmentPayload {
  enrollmentId: string;
  applicant: NibssApplicant;
  biometrics: {
    /** 10 base64-encoded fingerprint templates in ISO-19794-2 format. */
    fingerprints: string[];
    /** Base64-encoded HD face map. */
    faceMap: string;
    fingerprintFormat: "ISO-19794-2";
  };
  /** Regional compliance shard — "NG" | "GH". */
  shardCountry: string;
  orgId: string;
}

/**
 * Decrypts stored AES-256-GCM biometric blobs and repackages them into
 * the NIBSS Enrollment API / Sovereign Identity Gateway format.
 * Raw biometric buffers are never written to logs or persistent storage here.
 */
@Injectable()
export class NibssPackager {
  private readonly log = new Logger(NibssPackager.name);

  constructor(private readonly config: ConfigService) {}

  package(
    profile: UnbankedProfile,
    subject: InternalBiometricSubject,
    enrollmentId: string,
  ): NibssEnrollmentPayload {
    const secret = masterSecret(this.config);
    const salt   = cryptoSalt(this.config);

    // ── Decrypt fingerprints bundle ────────────────────────────────────────
    let fingerprints: string[] = [];
    if (subject.fingerprintsBundlePacked && Buffer.from(subject.fingerprintsBundlePacked).length > 0) {
      try {
        const plain = decryptPayload(
          unpackEncryptedBlob(Buffer.from(subject.fingerprintsBundlePacked)),
          secret,
          salt,
        );
        const doc = JSON.parse(plain.toString("utf8")) as { v: number; templates: string[] };
        fingerprints = doc.templates ?? [];
      } catch {
        this.log.error(`[NibssPackager] Failed to decrypt fingerprint bundle for ${enrollmentId}`);
      }
    }

    // ── Decrypt face ───────────────────────────────────────────────────────
    const facePlain = decryptPayload(
      unpackEncryptedBlob(Buffer.from(subject.facePacked)),
      secret,
      salt,
    );

    // ── Decrypt mobile ─────────────────────────────────────────────────────
    const mobilePlain = decryptPayload(
      unpackEncryptedBlob(Buffer.from(subject.mobilePacked)),
      secret,
      salt,
    );

    return {
      enrollmentId,
      applicant: {
        firstName:     profile.firstName,
        lastName:      profile.lastName,
        middleName:    profile.middleName ?? undefined,
        dateOfBirth:   profile.dateOfBirth.toISOString().split("T")[0],
        gender:        profile.gender,
        address:       profile.address,
        stateOfOrigin: profile.stateOfOrigin,
        mobile:        mobilePlain.toString("utf8"),
      },
      biometrics: {
        fingerprints,
        faceMap:           facePlain.toString("base64"),
        fingerprintFormat: "ISO-19794-2",
      },
      shardCountry: profile.shardCountry,
      orgId:        profile.orgId,
    };
  }
}

