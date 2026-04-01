import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { encryptPayload, packEncryptedBlob } from "@bsss/crypto";
import { PrismaService } from "../prisma/prisma.service";
import { VerificationService } from "../verification/verification.service";
import { StubLivenessService } from "../liveness/liveness.service";
import { cryptoSalt, defaultShardRegion, masterSecret } from "./crypto-env";
import type { AccountCreateDto } from "./dto/account-create.dto";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class AccountExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationService,
    private readonly liveness: StubLivenessService,
    private readonly config: ConfigService,
  ) {}

  async createAccount(dto: AccountCreateDto) {
    const currency = dto.currencyCode ?? "NGN";
    const initial = BigInt(dto.initialDepositMinor ?? "0");
    const shard = defaultShardRegion(this.config);
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    if (dto.mode === "bvn") {
      if (!dto.bvnEnrollment) throw new BadRequestException("bvnEnrollment required for mode=bvn");
      if (dto.bvnEnrollment.orgId === undefined) dto.bvnEnrollment.orgId = orgId;
      const en = await this.verification.enrollTripleGate(dto.bvnEnrollment);
      const publicRef = AccountExecutionService.newPublicRef();
      const acc = await this.prisma.ledgerAccount.create({
        data: {
          publicRef,
          ownerBvnHash: en.bvnHash,
          ownerInternalSubjectId: null,
          currencyCode: currency,
          balanceMinor: new Decimal(initial.toString()),
          shardRegion: shard,
          orgId,
        },
      });
      return {
        accountPublicRef: acc.publicRef,
        mode: "bvn",
        shardRegion: shard,
        tfanRecordId: en.tfanId_encrypted,
        bvnHash: en.bvnHash,
      };
    }

    if (!dto.internalEnrollment) throw new BadRequestException("internalEnrollment required for mode=internal");
    const face = Buffer.from(dto.internalEnrollment.faceTemplateB64, "base64");
    const live = await this.liveness.verifyPassive(face);
    if (!live.pass) throw new BadRequestException("Passive liveness failed");

    const secret = masterSecret(this.config);
    const salt = cryptoSalt(this.config);
    const facePacked = packEncryptedBlob(encryptPayload(face, secret, salt));
    const mobilePacked = packEncryptedBlob(
      encryptPayload(Buffer.from(dto.internalEnrollment.mobileNumber, "utf8"), secret, salt),
    );
    /** Three AES-256-GCM strings: (1) fingerprints bundle JSON with 10 templates, (2) face, (3) mobile */
    const bundleJson = JSON.stringify({
      v: 1,
      templates: dto.internalEnrollment.fingerprintsTemplateB64,
    });
    const fingerprintsBundlePacked = packEncryptedBlob(encryptPayload(Buffer.from(bundleJson, "utf8"), secret, salt));

    const publicSubjectId = `FMI-${randomBytes(5).toString("hex")}`;
    const publicRef = AccountExecutionService.newPublicRef();

    const row = await this.prisma.$transaction(async (tx) => {
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
      const acc = await tx.ledgerAccount.create({
        data: {
          publicRef,
          ownerBvnHash: null,
          ownerInternalSubjectId: subject.id,
          currencyCode: currency,
          balanceMinor: new Decimal(initial.toString()),
          shardRegion: shard,
          orgId,
        },
      });
      return { subject, acc };
    });

    return {
      accountPublicRef: row.acc.publicRef,
      publicSubjectId: row.subject.publicSubjectId,
      mode: "internal",
      shardRegion: shard,
      storage: "three_encrypted_strings_fingerprints_bundle_face_mobile",
    };
  }

  private static newPublicRef(): string {
    return `ACC-${randomBytes(6).toString("hex").toUpperCase()}`;
  }
}
