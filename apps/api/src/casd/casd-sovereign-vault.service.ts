import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PUSH_SENT, SOVEREIGN_VAULT_SEED } from "./casd.constants";
import type { PushToBankDto } from "./dto/push-to-bank.dto";

@Injectable()
export class CasdSovereignVaultService implements OnModuleInit {
  private readonly log = new Logger(CasdSovereignVaultService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedSovereignDocuments();
  }

  private async seedSovereignDocuments() {
    try {
      const count = await this.prisma.sovereignDocument.count();
      if (count > 0) return;
      for (const doc of SOVEREIGN_VAULT_SEED) {
        await this.prisma.sovereignDocument.create({
          data: {
            documentType:     doc.documentType,
            documentName:     doc.documentName,
            issuingAuthority: doc.issuingAuthority,
            issueDate:        doc.issueDate,
            expiryDate:       doc.expiryDate ?? null,
            documentHash:     doc.documentHash,
          },
        });
      }
      this.log.log("[CASD][Vault] 6 sovereign documents seeded");
    } catch (err) {
      this.log.warn(`[CASD][Vault] Seed skipped: ${String(err)}`);
    }
  }

  async listDocuments(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const docs = await this.prisma.sovereignDocument.findMany({
      where: { isActive: true }, orderBy: { documentType: "asc" },
      include: { _count: { select: { pushes: true } } },
    });
    return { count: docs.length, documents: docs };
  }

  /**
   * Push specified (or all active) sovereign documents to a bank's onboarding officer.
   * In production: sends authenticated email via SendGrid/AWS SES with signed download links.
   * Stub: marks each push as SENT immediately.
   */
  async pushToBank(bankApplicationId: string, dto: PushToBankDto, pushType: "MANUAL" | "AUTO" = "MANUAL", orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const app = await this.prisma.bankApplication.findUnique({ where: { id: bankApplicationId } });
    if (!app) throw new Error("Bank application not found");
    await this.pushAllToBank(bankApplicationId, app.contactEmail, pushType, orgId, dto.documentIds);
    return { message: `Sovereign documents pushed to ${app.contactEmail}`, bankName: app.bankName };
  }

  /** Internal — used by pipeline service on auto-approval and by controller on manual push. */
  async pushAllToBank(
    bankApplicationId: string, recipientEmail: string,
    pushType: "AUTO" | "MANUAL" = "AUTO", orgId = "default",
    documentIds?: readonly string[],
  ) {
    const where = documentIds?.length
      ? { isActive: true, id: { in: [...documentIds] } }
      : { isActive: true };
    const docs = await this.prisma.sovereignDocument.findMany({ where });
    const now  = new Date();

    for (const doc of docs) {
      await this.prisma.bankDocPush.create({
        data: {
          bankApplicationId, sovereignDocumentId: doc.id, pushType,
          recipientEmail, deliveryStatus: PUSH_SENT, sentAt: now, orgId,
        },
      });
    }
    await this.prisma.bankApplication.update({
      where: { id: bankApplicationId },
      data:  { pushCount: { increment: docs.length } },
    });
    this.log.log(`[CASD][Vault] pushed ${docs.length} docs to ${recipientEmail} (${pushType})`);
  }

  async getRecentPushes(orgId = "default", limit = 20) {
    await this.prisma.setOrgContext(orgId);
    const pushes = await this.prisma.bankDocPush.findMany({
      orderBy: { createdAt: "desc" }, take: limit,
      include: {
        application: { select: { bankName: true, contactEmail: true } },
        document:    { select: { documentName: true, documentType: true } },
      },
    });
    return { count: pushes.length, pushes };
  }

  async incrementDownload(id: string) {
    await this.prisma.sovereignDocument.update({
      where: { id }, data: { downloadCount: { increment: 1 } },
    });
    return { downloaded: true };
  }
}

