import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CasdSovereignVaultService } from "./casd-sovereign-vault.service";
import type { UpdateBankStatusDto } from "./dto/update-bank-status.dto";
import {
  CASD_APPROVED, CASD_PENDING_REVIEW, CASD_REJECTED,
  CASD_STATUS_PIPELINE, CASD_VERIFICATION_IN_PROGRESS,
  BANK_CAT_COMMERCIAL, BANK_CAT_MICROFINANCE, BANK_CAT_MOBILE_MONEY,
  BDOC_CBN_LICENSE, BDOC_CORPORATE_REG, BDOC_BIOMETRIC_SIGNATORY,
} from "./casd.constants";

const DEMO_APPLICATIONS = [
  {
    bankName: "Access Bank PLC", bankCode: "044150149", bankCategory: BANK_CAT_COMMERCIAL,
    contactName: "Taiwo Adewale", contactEmail: "fintech@accessbankplc.com",
    contactPhone: "+2348012345678", registrationNumber: "RC 000327",
    status: CASD_PENDING_REVIEW,
    docs: [
      { documentType: BDOC_CBN_LICENSE,         documentName: "CBN Banking License 2024" },
      { documentType: BDOC_CORPORATE_REG,        documentName: "Corporate Affairs Commission Certificate" },
    ],
  },
  {
    bankName: "Guaranty Trust Bank PLC", bankCode: "058063220", bankCategory: BANK_CAT_COMMERCIAL,
    contactName: "Chidi Nwosu", contactEmail: "partnerships@gtbank.com",
    contactPhone: "+2348023456789", registrationNumber: "RC 000152",
    status: CASD_VERIFICATION_IN_PROGRESS,
    docs: [
      { documentType: BDOC_CBN_LICENSE,         documentName: "CBN Universal Banking License" },
      { documentType: BDOC_BIOMETRIC_SIGNATORY,  documentName: "Directors Biometric Signatory Pack" },
      { documentType: BDOC_CORPORATE_REG,        documentName: "CAC Certificate of Incorporation" },
    ],
  },
  {
    bankName: "LAPO Microfinance Bank", bankCode: "070090905", bankCategory: BANK_CAT_MICROFINANCE,
    contactName: "Ngozi Okafor", contactEmail: "digital@lapomfb.com",
    contactPhone: "+2348034567890", registrationNumber: "MFB/LAG/0021",
    status: CASD_APPROVED, approvedAt: new Date(),
    docs: [
      { documentType: BDOC_CBN_LICENSE,   documentName: "CBN Microfinance Banking Licence" },
      { documentType: BDOC_CORPORATE_REG, documentName: "Corporate Registration Certificate" },
    ],
  },
  {
    bankName: "OPay Digital Services Ltd", bankCode: "999991", bankCategory: BANK_CAT_MOBILE_MONEY,
    contactName: "Emeka Ibrahim", contactEmail: "enterprise@opay.com",
    contactPhone: "+2348045678901", registrationNumber: "RC 1599636",
    status: CASD_PENDING_REVIEW,
    docs: [
      { documentType: BDOC_CBN_LICENSE,   documentName: "Mobile Money Operator License" },
    ],
  },
] as const;

@Injectable()
export class CasdBankPipelineService implements OnModuleInit {
  private readonly log = new Logger(CasdBankPipelineService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly vault:   CasdSovereignVaultService,
  ) {}

  async onModuleInit() {
    await this.seedDemoApplications();
  }

  private async seedDemoApplications() {
    try {
      const count = await this.prisma.bankApplication.count();
      if (count > 0) return;
      for (const app of DEMO_APPLICATIONS) {
        const created = await this.prisma.bankApplication.create({
          data: {
            bankName: app.bankName, bankCode: app.bankCode, bankCategory: app.bankCategory,
            contactName: app.contactName, contactEmail: app.contactEmail,
            contactPhone: app.contactPhone, registrationNumber: app.registrationNumber,
            status: app.status,
            approvedAt: "approvedAt" in app ? (app as { approvedAt: Date }).approvedAt : null,
          },
        });
        for (const doc of app.docs) {
          await this.prisma.bankDocument.create({
            data: { bankApplicationId: created.id, documentType: doc.documentType,
              documentName: doc.documentName, mimeType: "application/pdf",
              fileSizeBytes: Math.floor(Math.random() * 2_000_000) + 500_000,
              documentHash: Buffer.from(doc.documentName).toString("hex").slice(0, 64) },
          });
        }
      }
      this.log.log("[CASD] Demo bank applications seeded");
    } catch (err) {
      this.log.warn(`[CASD] Demo seed skipped: ${String(err)}`);
    }
  }

  async listApplications(orgId = "default", status?: string) {
    await this.prisma.setOrgContext(orgId);
    const where = status ? { status } : {};
    const apps  = await this.prisma.bankApplication.findMany({
      where, orderBy: { createdAt: "desc" },
      include: { documents: true, _count: { select: { pushes: true } } },
    });
    return { count: apps.length, applications: apps };
  }

  async advanceStatus(id: string, dto: UpdateBankStatusDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);
    const app = await this.prisma.bankApplication.findUnique({ where: { id } });
    if (!app) throw new BadRequestException("Bank application not found");
    if (dto.status === CASD_REJECTED && !dto.reviewerNotes)
      throw new BadRequestException("reviewerNotes required when rejecting an application");

    const now = new Date();
    const updated = await this.prisma.bankApplication.update({
      where: { id },
      data: {
        status: dto.status,
        reviewerNotes: dto.reviewerNotes ?? app.reviewerNotes,
        approvedAt:   dto.status === CASD_APPROVED  ? now : app.approvedAt,
        rejectedAt:   dto.status === CASD_REJECTED  ? now : app.rejectedAt,
      },
      include: { documents: true },
    });

    // Auto push-to-bank on approval
    if (dto.status === CASD_APPROVED) {
      await this.vault.pushAllToBank(id, app.contactEmail, "AUTO", orgId);
      this.log.log(`[CASD] Bank APPROVED — auto push dispatched: ${app.bankName}`);
    }

    return { bankApplication: updated, message: `Status updated to ${dto.status}` };
  }

  async getDocuments(id: string, orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const app = await this.prisma.bankApplication.findUnique({
      where: { id }, include: { documents: true },
    });
    if (!app) throw new BadRequestException("Bank application not found");
    return { bankName: app.bankName, status: app.status, documents: app.documents };
  }

  async getSummary(orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const [total, pending, inReview, approved, rejected] = await Promise.all([
      this.prisma.bankApplication.count(),
      this.prisma.bankApplication.count({ where: { status: CASD_PENDING_REVIEW } }),
      this.prisma.bankApplication.count({ where: { status: CASD_VERIFICATION_IN_PROGRESS } }),
      this.prisma.bankApplication.count({ where: { status: CASD_APPROVED } }),
      this.prisma.bankApplication.count({ where: { status: CASD_REJECTED } }),
    ]);
    return { total, pending, inReview, approved, rejected };
  }
}

