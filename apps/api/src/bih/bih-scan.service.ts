import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { NibssSearchService } from "./nibss-search.service";
import type { InitiateScanDto } from "./dto/initiate-scan.dto";
import type { SubmitTemplateDto } from "./dto/submit-template.dto";
import type { SelectBankProvisionDto } from "./dto/select-bank-provision.dto";
import {
  BIH_BANK_SELECTED, BIH_COMPLETED, BIH_FAILED, BIH_IDENTITY_UNLOCKED,
  BIH_NIBSS_MATCHED, BIH_NO_MATCH, BIH_PROVISIONING, BIH_SCAN_REQUESTED,
  BIH_PROVISION_MANDATE_MS, BIH_SESSION_TTL_S, PROV_FAILED, PROV_PENDING, PROV_SUCCESS,
  EVT_SCAN_INITIATED, EVT_TEMPLATE_ENCRYPTED, EVT_TEMPLATE_PURGED, EVT_NIBSS_PING_SENT,
  EVT_NIBSS_MATCHED, EVT_NIBSS_NO_MATCH, EVT_IDENTITY_UNLOCKED,
  EVT_BANK_SELECTED, EVT_PROVISION_STARTED, EVT_ACCOUNT_MINTED, EVT_PROVISION_FAILED,
} from "./bih.constants";
import { randomUUID } from "node:crypto";

@Injectable()
export class BihScanService {
  private readonly log = new Logger(BihScanService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly nibss:    NibssSearchService,
    private readonly bankDir:  BankDirectoryService,
  ) {}

  /** Step 0 — Prime a scan session; client captures fingerprint and calls /template next. */
  async initiateScan(dto: InitiateScanDto) {
    const orgId   = dto.orgId ?? "default";
    const scanRef = `BIH-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + BIH_SESSION_TTL_S * 1000);
    await this.prisma.setOrgContext(orgId);

    await this.prisma.biometricScanSession.create({
      data: { scanRef, transactionType: dto.transactionType, status: BIH_SCAN_REQUESTED, sessionExpiresAt: expiresAt, orgId },
    });
    await this.audit(scanRef, EVT_SCAN_INITIATED, null, null, null, null, dto.transactionType,
      { transactionType: dto.transactionType }, orgId);

    return { scanRef, transactionType: dto.transactionType, expiresAt,
      instruction: "Place finger on FAP-20 sensor. Submit ISO 19794-2 WSQ minutiae to POST /v1/bih/:scanRef/template.",
      message: "Scan session primed. Awaiting fingerprint template." };
  }

  /** Step 1 — Receive raw template, encrypt → NIBSS 1:N search → identity unlock. */
  async submitTemplate(scanRef: string, dto: SubmitTemplateDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadActive(scanRef, orgId, BIH_SCAN_REQUESTED);
    await this.prisma.setOrgContext(orgId);

    const rawTemplate = Buffer.from(dto.rawTemplateB64, "base64");

    // 1. Encrypt template (AES-256-GCM) before NIBSS transit
    const { hash: minutiaeHash } = this.nibss.encryptTemplate(rawTemplate);
    await this.audit(scanRef, EVT_TEMPLATE_ENCRYPTED, null, null, null, null, session.transactionType,
      { sensorDeviceId: dto.sensorDeviceId, minutiaeHash }, orgId);
    await this.audit(scanRef, EVT_NIBSS_PING_SENT, null, null, null, null, session.transactionType, {}, orgId);

    // 2. 1:N NIBSS search — encrypted template forwarded internally; raw template discarded
    const result = await this.nibss.searchByFingerprint(rawTemplate);

    // 3. Purge encrypted template immediately — raw bytes go out of scope here
    const purgedAt = new Date();
    await this.audit(scanRef, EVT_TEMPLATE_PURGED, null, null, result.latencyMs, null, session.transactionType,
      { purgedAt: purgedAt.toISOString(), minutiaeHash }, orgId);

    if (!result.matched || !result.identity) {
      await this.prisma.biometricScanSession.update({
        where: { scanRef },
        data: { status: BIH_NO_MATCH, encryptedMinutiaeHash: minutiaeHash, templatePurgedAt: purgedAt, failureReason: "NIBSS 1:N — NoMatch" },
      });
      await this.audit(scanRef, EVT_NIBSS_NO_MATCH, null, null, result.latencyMs, null, session.transactionType,
        { latencyMs: result.latencyMs }, orgId);
      throw new ForbiddenException("Fingerprint not found in NIBSS national registry — identity not verified");
    }

    // 4. Encrypt identity package and store — NIBSS_MATCHED → IDENTITY_UNLOCKED
    const blob = this.nibss.encryptIdentity(result.identity);
    await this.prisma.biometricScanSession.update({
      where: { scanRef },
      data: {
        status: BIH_IDENTITY_UNLOCKED, nibssMatchId: result.nibssMatchId,
        nibssLatencyMs: result.latencyMs, shadowProfileBlob: blob,
        encryptedMinutiaeHash: minutiaeHash, templatePurgedAt: purgedAt,
      },
    });
    await this.audit(scanRef, EVT_NIBSS_MATCHED, result.nibssMatchId, null, result.latencyMs, null, session.transactionType,
      { latencyMs: result.latencyMs, stateOfOrigin: result.identity.stateOfOrigin, gender: result.identity.gender }, orgId);
    await this.audit(scanRef, EVT_IDENTITY_UNLOCKED, result.nibssMatchId, null, result.latencyMs, null, session.transactionType, {}, orgId);

    this.log.log(`[BIH] identity unlocked scanRef=${scanRef} nibssMatchId=${result.nibssMatchId} latencyMs=${result.latencyMs}`);

    // Preview — zero sensitive data; no BVN, no full address returned to client
    const { identity: id } = result;
    const latencyWarning = result.latencyMs > 3000;
    return {
      scanRef, status: BIH_IDENTITY_UNLOCKED, nibssMatchId: result.nibssMatchId, nibssLatencyMs: result.latencyMs,
      latencyWarning, transactionType: session.transactionType,
      identityPreview: {
        fullName: id.fullName, dateOfBirth: id.dateOfBirth, gender: id.gender,
        stateOfOrigin: id.stateOfOrigin, addressSummary: id.address.split(",")[0],
      },
      bankDirectory: this.bankDir.listBanks(),
      message: `Identity unlocked in ${result.latencyMs}ms. ${session.transactionType === "ACCOUNT_SETUP" ? "Select a bank to provision your account." : "Fingerprint authorized — submit operation details."}`,
    };
  }

  /** Step 2 (ACCOUNT_SETUP) — Zero-Input CBS push: NIBSS data is the sole source. */
  async selectBankAndProvision(scanRef: string, dto: SelectBankProvisionDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadActive(scanRef, orgId, BIH_IDENTITY_UNLOCKED);
    if (session.transactionType !== "ACCOUNT_SETUP") throw new BadRequestException("Bank selection only valid for ACCOUNT_SETUP sessions");
    if (!session.shadowProfileBlob) throw new BadRequestException("Shadow profile missing from session");
    await this.prisma.setOrgContext(orgId);

    const bank     = this.bankDir.findByCode(dto.bankCode);
    const identity = this.nibss.decryptIdentity(Buffer.from(session.shadowProfileBlob));

    await this.prisma.biometricScanSession.update({
      where: { scanRef },
      data: { selectedBankCode: dto.bankCode, selectedBankName: bank.name, accountType: dto.accountType, status: BIH_BANK_SELECTED },
    });
    await this.audit(scanRef, EVT_BANK_SELECTED, session.nibssMatchId, null, null, null, session.transactionType,
      { bankCode: dto.bankCode, bankName: bank.name, accountType: dto.accountType }, orgId);

    // Provision: STRICTLY no user-supplied identity — NIBSS shadow profile only
    const provisionStartedAt = new Date();
    await this.prisma.biometricScanSession.update({
      where: { scanRef },
      data: { status: BIH_PROVISIONING, provisionStartedAt, bankProvisioningStatus: PROV_PENDING },
    });
    await this.audit(scanRef, EVT_PROVISION_STARTED, session.nibssMatchId, null, null, PROV_PENDING, session.transactionType, {}, orgId);

    try {
      const cbsResult = await this.bankDir.pushToCbs(bank, {
        firstName: identity.firstName, lastName: identity.lastName, middleName: identity.middleName,
        dateOfBirth: identity.dateOfBirth, gender: identity.gender, address: identity.address,
        nibssTokenId: session.nibssMatchId ?? "",
      }, dto.accountType);

      const completedAt = new Date();
      const elapsedMs   = completedAt.getTime() - provisionStartedAt.getTime();
      const mandateMet  = elapsedMs <= BIH_PROVISION_MANDATE_MS;

      await this.prisma.biometricScanSession.update({
        where: { scanRef },
        data: { status: BIH_COMPLETED, accountNumber: cbsResult.accountNumber, bankApiResponse: cbsResult.bankApiResponse,
          bankProvisioningStatus: PROV_SUCCESS, completedAt, elapsedMs: Math.min(elapsedMs, 2_147_483_647) },
      });

      const accountGenTimestamp = completedAt;
      await this.audit(scanRef, EVT_ACCOUNT_MINTED, session.nibssMatchId, cbsResult.bankApiResponse,
        null, PROV_SUCCESS, session.transactionType,
        { accountNumber: cbsResult.accountNumber, bankName: bank.name, elapsedMs, mandateMet }, orgId);
      // Write dedicated audit row with accountGenTimestamp for compliance
      await this.prisma.bihAuditLog.create({
        data: { scanRef, eventType: EVT_ACCOUNT_MINTED, nibssMatchId: session.nibssMatchId,
          bankProvisioningStatus: PROV_SUCCESS, accountGenTimestamp, scanLatencyMs: session.nibssLatencyMs,
          operationType: session.transactionType, metadataJson: JSON.stringify({ accountNumber: cbsResult.accountNumber, elapsedMs, mandateMet }), orgId },
      });

      this.log.log(`[BIH] account minted scanRef=${scanRef} account=${cbsResult.accountNumber} elapsedMs=${elapsedMs}`);
      return { scanRef, status: BIH_COMPLETED, accountNumber: cbsResult.accountNumber, bankName: bank.name,
        accountType: dto.accountType, nibssMatchId: session.nibssMatchId, elapsedMs, mandateMet,
        zeroInputCompliant: true,
        message: mandateMet ? `Account minted in ${elapsedMs}ms — within 60s mandate. Zero-input rule enforced.`
          : `Account minted in ${elapsedMs}ms — mandate breached. Flagged for review.` };
    } catch (err) {
      await this.prisma.biometricScanSession.update({
        where: { scanRef }, data: { status: BIH_FAILED, bankProvisioningStatus: PROV_FAILED, failureReason: String(err).slice(0, 512) } });
      await this.audit(scanRef, EVT_PROVISION_FAILED, session.nibssMatchId, null, null, PROV_FAILED, session.transactionType, { error: String(err) }, orgId);
      throw new BadRequestException(`CBS provisioning failed: ${String(err)}`);
    }
  }

  async getSessionStatus(scanRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.biometricScanSession.findUnique({ where: { scanRef } });
    if (!s) throw new BadRequestException("BIH scan session not found");
    return { scanRef, status: s.status, transactionType: s.transactionType, nibssMatchId: s.nibssMatchId,
      nibssLatencyMs: s.nibssLatencyMs, selectedBankCode: s.selectedBankCode, accountType: s.accountType,
      accountNumber: s.accountNumber, bankProvisioningStatus: s.bankProvisioningStatus, elapsedMs: s.elapsedMs };
  }

  async loadActive(scanRef: string, orgId: string, requiredStatus?: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.biometricScanSession.findUnique({ where: { scanRef } });
    if (!s) throw new BadRequestException("BIH scan session not found");
    if (s.sessionExpiresAt < new Date()) throw new BadRequestException("BIH scan session has expired");
    if (requiredStatus && s.status !== requiredStatus)
      throw new BadRequestException(`Expected status ${requiredStatus}, got ${s.status}`);
    return s;
  }

  async audit(scanRef: string, eventType: string, nibssMatchId: string | null | undefined,
    bankApiResponse: string | null, scanLatencyMs: number | null | undefined,
    bankProvisioningStatus: string | null | undefined, operationType: string | null | undefined,
    metadata: Record<string, unknown>, orgId: string) {
    try {
      await this.prisma.bihAuditLog.create({
        data: { scanRef, eventType, nibssMatchId: nibssMatchId ?? null, bankApiResponse,
          scanLatencyMs: scanLatencyMs ?? null, bankProvisioningStatus: bankProvisioningStatus ?? null,
          operationType: operationType ?? null, metadataJson: JSON.stringify(metadata), orgId },
      });
    } catch { /* audit must never break main flow */ }
  }
}

