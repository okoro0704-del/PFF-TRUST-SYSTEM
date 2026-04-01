import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { encryptPayload, packEncryptedBlob } from "@bsss/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StubLivenessService } from "../liveness/liveness.service";
import { cryptoSalt, defaultShardRegion, masterSecret } from "../execution/crypto-env";
import type { UnbankedEnrollDto } from "./dto/unbanked-enroll.dto";
import type { ProfileEditDto } from "./dto/profile-edit.dto";

@Injectable()
export class UnbankedCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveness: StubLivenessService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Full-Spectrum Enrollment:
   * 1. Passive liveness check on face.
   * 2. AES-256-GCM encrypt all biometrics (fingerprint bundle, face, mobile).
   * 3. Persist InternalBiometricSubject + UnbankedProfile in one transaction.
   * 4. Return TFAN — the internal primary key while BVN is pending.
   */
  async enrollUnbanked(dto: UnbankedEnrollDto) {
    // ── Liveness gate ──────────────────────────────────────────────────────
    const face = Buffer.from(dto.faceTemplateB64, "base64");
    const live = await this.liveness.verifyPassive(face);
    if (!live.pass) throw new BadRequestException("Passive liveness check failed");

    const secret  = masterSecret(this.config);
    const salt    = cryptoSalt(this.config);
    const shard   = defaultShardRegion(this.config);
    const country = dto.shardCountry ?? "NG";
    const orgId   = dto.orgId ?? "default";

    // ── Encrypt biometrics ─────────────────────────────────────────────────
    const bundleJson = JSON.stringify({ v: 1, templates: dto.fingerprintsTemplateB64 });
    const fingerprintsBundlePacked = packEncryptedBlob(
      encryptPayload(Buffer.from(bundleJson, "utf8"), secret, salt),
    );
    const facePacked = packEncryptedBlob(encryptPayload(face, secret, salt));
    const mobilePacked = packEncryptedBlob(
      encryptPayload(Buffer.from(dto.mobileNumber, "utf8"), secret, salt),
    );

    // ── Identifiers ────────────────────────────────────────────────────────
    const publicSubjectId = `FMI-${randomBytes(5).toString("hex")}`;
    const tfanId          = `TFAN-${randomBytes(6).toString("hex").toUpperCase()}`;

    await this.prisma.setOrgContext(orgId);

    const result = await this.prisma.$transaction(async (tx) => {
      const subject = await tx.internalBiometricSubject.create({
        data: {
          publicSubjectId,
          fingerprintsBundlePacked,
          facePacked,
          mobilePacked,
          shardRegion: shard,
          orgId,
        },
      });
      const profile = await tx.unbankedProfile.create({
        data: {
          tfanId,
          internalSubjectId: subject.id,
          firstName:    dto.firstName,
          lastName:     dto.lastName,
          middleName:   dto.middleName,
          dateOfBirth:  new Date(dto.dateOfBirth),
          gender:       dto.gender,
          address:      dto.address,
          stateOfOrigin: dto.stateOfOrigin,
          shardCountry: country,
          status:       "UNBANKED",
          orgId,
        },
      });
      return { subject, profile };
    });

    return {
      tfanId,
      publicSubjectId: result.subject.publicSubjectId,
      status:          "UNBANKED",
      shardCountry:    country,
      biometricsCaptured: {
        fingerprints: dto.fingerprintsTemplateB64.length,
        face:         true,
        mobile:       true,
      },
      message: "Full-spectrum enrollment complete. Call POST /v1/unbanked/push-nibss to generate BVN.",
    };
  }

  /** Profile status check — redacts BVN hash from submission log. */
  async getProfile(tfanId: string, orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const profile = await this.prisma.unbankedProfile.findUnique({
      where: { tfanId },
      include: {
        submissions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!profile) throw new BadRequestException("TFAN not found");

    return {
      tfanId:           profile.tfanId,
      status:           profile.status,
      shardCountry:     profile.shardCountry,
      demographics: {
        name:          `${profile.firstName} ${profile.lastName}`,
        stateOfOrigin: profile.stateOfOrigin,
        gender:        profile.gender,
      },
      nibssEnrollmentId: profile.nibssEnrollmentId,
      bvnLinked:         !!profile.bvnHash,
      submissionHistory: profile.submissions.map((s) => ({
        enrollmentId: s.enrollmentId,
        nibssStatus:  s.nibssStatus,
        submittedAt:  s.submissionTimestamp,
        hasResponse:  !!s.nibssResponsePayload,
      })),
    };
  }

  /**
   * Non-biometric profile edit — PATCH /v1/unbanked/:tfanId/profile
   *
   * Allowed fields: firstName, lastName, middleName, address, stateOfOrigin.
   * Permanently immutable fields: gender, dateOfBirth, all biometric blobs.
   * Blocked while status = NIBSS_SUBMITTED (submission in flight).
   */
  async editProfile(tfanId: string, dto: ProfileEditDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    const profile = await this.prisma.unbankedProfile.findUnique({ where: { tfanId } });
    if (!profile) throw new BadRequestException("TFAN not found");
    if (profile.status === "NIBSS_SUBMITTED") {
      throw new BadRequestException(
        "Profile cannot be edited while a NIBSS submission is in flight. Await callback or retry.",
      );
    }

    const updated = await this.prisma.unbankedProfile.update({
      where: { tfanId },
      data: {
        ...(dto.firstName    !== undefined && { firstName:    dto.firstName }),
        ...(dto.lastName     !== undefined && { lastName:     dto.lastName }),
        ...(dto.middleName   !== undefined && { middleName:   dto.middleName || null }),
        ...(dto.address      !== undefined && { address:      dto.address }),
        ...(dto.stateOfOrigin !== undefined && { stateOfOrigin: dto.stateOfOrigin }),
      },
    });

    return {
      tfanId:   updated.tfanId,
      status:   updated.status,
      demographics: {
        name:          `${updated.firstName} ${updated.lastName}`,
        middleName:    updated.middleName,
        address:       updated.address,
        stateOfOrigin: updated.stateOfOrigin,
        gender:        updated.gender,
      },
      message: "Non-biometric data updated. Biometric strings and identity fields remain immutable.",
    };
  }
}

