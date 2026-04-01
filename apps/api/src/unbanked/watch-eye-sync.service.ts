import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { encryptPayload, packEncryptedBlob } from "@bsss/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { masterSecret, cryptoSalt } from "../execution/crypto-env";
import type { SyncMirrorDto } from "./dto/sync-mirror.dto";

/**
 * Watch Eye Mirror Sync Service.
 *
 * Intercepts NIBSS YES responses and writes each verified biometric gate into the
 * immutable Watch Eye Supplemental Log (watch_eye_supplemental_log).
 *
 * Design principles:
 *   - TfanRecord (set at enrollment) is NEVER overwritten — immutable primary mirror.
 *   - Every post-enrollment YES is APPENDED to WatchEyeSupplementalLog.
 *   - Each entry is independently AES-256-GCM encrypted with a fresh IV.
 *   - bvnHash is the natural key — no raw BVN is persisted.
 */
@Injectable()
export class WatchEyeSyncService {
  private readonly log = new Logger(WatchEyeSyncService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  async mirrorNibssYes(dto: SyncMirrorDto): Promise<{
    mirrored:         boolean;
    gatesMirrored:    string[];
    supplementalCount: number;
  }> {
    const pepper  = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    const bvnHash = createHmac("sha256", pepper).update(dto.bvn.normalize("NFKC")).digest("hex");
    const secret  = masterSecret(this.config);
    const salt    = cryptoSalt(this.config);
    const orgId   = dto.orgId ?? "default";
    const corrId  = dto.correlationId ?? null;

    if (!dto.fingerprintTemplateB64 && !dto.faceTemplateB64 && !dto.mobileNumber) {
      throw new BadRequestException(
        "At least one biometric gate (fingerprintTemplateB64 | faceTemplateB64 | mobileNumber) is required",
      );
    }

    await this.prisma.setOrgContext(orgId);

    // Guard: TfanRecord must exist — enrollment via POST /v1/identity/enroll is a prerequisite
    const tfan = await this.prisma.tfanRecord.findFirst({ where: { bvnHash } });
    if (!tfan) {
      throw new BadRequestException(
        "BVN not enrolled in Watch Eye — call POST /v1/identity/enroll first",
      );
    }

    const gatesMirrored: string[] = [];

    if (dto.fingerprintTemplateB64?.length) {
      const blob = packEncryptedBlob(
        encryptPayload(Buffer.from(dto.fingerprintTemplateB64, "base64"), secret, salt),
      );
      await this.prisma.watchEyeSupplementalLog.create({
        data: { bvnHash, gate: "fingerprint", packedBlob: blob, correlationId: corrId, orgId },
      });
      gatesMirrored.push("fingerprint");
    }

    if (dto.faceTemplateB64?.length) {
      const blob = packEncryptedBlob(
        encryptPayload(Buffer.from(dto.faceTemplateB64, "base64"), secret, salt),
      );
      await this.prisma.watchEyeSupplementalLog.create({
        data: { bvnHash, gate: "face", packedBlob: blob, correlationId: corrId, orgId },
      });
      gatesMirrored.push("face");
    }

    if (dto.mobileNumber?.trim().length) {
      const blob = packEncryptedBlob(
        encryptPayload(Buffer.from(dto.mobileNumber.trim(), "utf8"), secret, salt),
      );
      await this.prisma.watchEyeSupplementalLog.create({
        data: { bvnHash, gate: "mobile", packedBlob: blob, correlationId: corrId, orgId },
      });
      gatesMirrored.push("mobile");
    }

    this.log.log(
      `[WatchEye] Supplemental mirror: bvnHash=${bvnHash.slice(0, 10)}… gates=${gatesMirrored.join(",")} corrId=${corrId}`,
    );

    return { mirrored: true, gatesMirrored, supplementalCount: gatesMirrored.length };
  }

  /** Returns the count of supplemental log entries per gate for a given BVN. */
  async supplementalHistory(bvn: string, orgId = "default") {
    const pepper  = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    const bvnHash = createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
    await this.prisma.setOrgContext(orgId);
    const rows = await this.prisma.watchEyeSupplementalLog.findMany({
      where:   { bvnHash, orgId },
      orderBy: { createdAt: "desc" },
      take:    50,
      select:  { gate: true, correlationId: true, createdAt: true },
    });
    return { bvnHash: bvnHash.slice(0, 12) + "...", entries: rows };
  }
}

