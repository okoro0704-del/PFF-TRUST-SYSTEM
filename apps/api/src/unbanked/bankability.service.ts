import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomBytes } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import { defaultShardRegion } from "../execution/crypto-env";

@Injectable()
export class BankabilityService {
  private readonly log = new Logger(BankabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Profile Evolution: UNBANKED/NIBSS_SUBMITTED → BANKABLE
   *
   * 1. Hash the NIBSS-issued BVN.
   * 2. Mirror Watch Eye: create TfanRecord (syncs all three biometric strings to BVN namespace).
   * 3. Provision Dedicated Tier-1 Bank Account (LedgerAccount) via the new BVN.
   * 4. Evolve UnbankedProfile status to BANKABLE.
   */
  async upgradeToGlobal(params: {
    tfanId: string;
    bvn: string;
    orgId: string;
  }): Promise<{ accountPublicRef: string; bvnHash: string; status: string }> {
    const { tfanId, bvn, orgId } = params;
    await this.prisma.setOrgContext(orgId);

    const profile = await this.prisma.unbankedProfile.findUnique({
      where: { tfanId },
      include: { internalSubject: true },
    });
    if (!profile) throw new BadRequestException("TFAN not found for bankability upgrade");

    // Idempotency: already upgraded
    if (profile.status === "BANKABLE" && profile.bvnHash) {
      this.log.warn(`[Bankability] ${tfanId} already BANKABLE — skipping upgrade`);
      return { accountPublicRef: "", bvnHash: profile.bvnHash, status: "BANKABLE" };
    }

    const pepper  = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    const bvnHash = createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
    const shard   = defaultShardRegion(this.config);
    const sub     = profile.internalSubject;

    // The packed fingerprint bundle is reused as-is for the TfanRecord
    const fpPacked = sub.fingerprintsBundlePacked
      ? Buffer.from(sub.fingerprintsBundlePacked)
      : Buffer.alloc(0);

    const publicRef = `ACC-${randomBytes(6).toString("hex").toUpperCase()}`;

    await this.prisma.$transaction(async (tx) => {
      // ── Mirror Watch Eye: sync biometric strings to BVN-keyed TfanRecord ──
      const existingTfan = await tx.tfanRecord.findFirst({ where: { bvnHash } });
      if (!existingTfan) {
        await tx.tfanRecord.create({
          data: {
            bvnHash,
            fingerprintPacked: fpPacked,
            facePacked:        Buffer.from(sub.facePacked),
            mobilePacked:      Buffer.from(sub.mobilePacked),
          },
        });
        this.log.log(`[WatchEye] TfanRecord created for new BVN — mirror sync complete`);
      } else {
        this.log.warn(`[WatchEye] TfanRecord already exists for this BVN — skipping mirror`);
      }

      // ── Provision Dedicated Tier-1 Bank Account ────────────────────────
      await tx.ledgerAccount.create({
        data: {
          publicRef,
          ownerBvnHash:           bvnHash,
          ownerInternalSubjectId: null,   // NIBSS portal becomes primary auth path
          currencyCode:           "NGN",
          balanceMinor:           new Decimal("0"),
          shardRegion:            shard,
          orgId,
        },
      });

      // ── Evolve profile status ──────────────────────────────────────────
      await tx.unbankedProfile.update({
        where: { tfanId },
        data:  { status: "BANKABLE", bvnHash },
      });
    });

    this.log.log(`[Bankability] ${tfanId} → BANKABLE. Account: ${publicRef}`);
    return { accountPublicRef: publicRef, bvnHash, status: "BANKABLE" };
  }

  /**
   * Mirror Protocol — DUPLICATE flag from NIBSS:
   * Links the existing national BVN to our internal TFAN without creating a duplicate TfanRecord.
   */
  async linkDuplicateBvn(tfanId: string, existingBvn: string, orgId: string): Promise<void> {
    await this.prisma.setOrgContext(orgId);
    const pepper  = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    const bvnHash = createHmac("sha256", pepper).update(existingBvn.normalize("NFKC")).digest("hex");

    await this.prisma.unbankedProfile.update({
      where: { tfanId },
      data:  { status: "DUPLICATE_LINKED", bvnHash },
    });
    this.log.warn(`[MirrorProtocol] ${tfanId} linked to existing BVN (DUPLICATE_LINKED)`);
  }
}

