import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { NibssHarvestService } from "./nibss-harvest.service";
import { BankDirectoryService } from "./bank-directory.service";
import type { AuthorizeProvisionDto } from "./dto/authorize-provision.dto";
import { BiometricGate } from "./dto/authorize-provision.dto";
import {
  EVT_ACCOUNT_MINTED, EVT_BIOMETRIC_OK, EVT_PROVISION_FAILED,
  EVT_PROVISION_STARTED, EVT_SMS_DISPATCHED,
  ZFOE_BANK_SELECTED, ZFOE_BIOMETRIC_OK, ZFOE_COMPLETED,
  ZFOE_FAILED, ZFOE_PROVISIONING, ZFOE_PROVISION_MANDATE_MS,
} from "./zfoe.constants";

/**
 * AccountProvisionService — Step 3: Biometric Authorization + Account Minting.
 *
 * Execution sequence:
 *   1. Load active ZFOE session (must be BANK_SELECTED).
 *   2. NIBSS biometric gate (Face or FAP-20 Fingerprint) via LbasModule.
 *   3. Mark BIOMETRIC_OK → PROVISIONING (starts 60-second mandate clock).
 *   4. CBS push via BankDirectoryService (account number issued by bank).
 *   5. Record elapsedMs — must be < ZFOE_PROVISION_MANDATE_MS (60 000ms).
 *   6. Write ZfoeAuditLog: NIBSS_Token_ID + Bank_API_Response + Account_Gen_Timestamp.
 *   7. SMS/Push stub dispatched to BVN-linked MSISDN.
 *   8. Session → COMPLETED.
 */
@Injectable()
export class AccountProvisionService {
  private readonly log = new Logger(AccountProvisionService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly config:   ConfigService,
    private readonly nibss:    NibssFactory,
    private readonly harvest:  NibssHarvestService,
    private readonly bankDir:  BankDirectoryService,
  ) {}

  async authorizeAndProvision(sessionRef: string, dto: AuthorizeProvisionDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    // ── 1. Load active session ───────────────────────────────────────────────
    const session = await this.harvest.loadActive(sessionRef, orgId, ZFOE_BANK_SELECTED);
    if (!session.shadowProfileBlob) throw new BadRequestException("Shadow profile missing from session");
    if (!session.selectedBankCode || !session.accountType) throw new BadRequestException("Bank not selected");

    // ── 2. NIBSS Biometric Gate ──────────────────────────────────────────────
    const bundle   = this.nibss.create();
    const template = Buffer.from(dto.biometricTemplateB64, "base64");
    const biometricResult = dto.gate === BiometricGate.FACE
      ? await bundle.biometric.verifyFace(dto.customerBvn, template)
      : await bundle.biometric.verifyFingerprint(dto.customerBvn, template);

    if (biometricResult.outcome !== MatchOutcome.MatchFound) {
      await this.prisma.zfoeSession.update({ where: { sessionRef }, data: { status: ZFOE_FAILED, failureReason: "Biometric NoMatch" } });
      await this.harvest.writeAudit(sessionRef, EVT_PROVISION_FAILED, session.nibssTokenId, null, orgId,
        { gate: dto.gate, nibssOutcome: biometricResult.outcome });
      throw new ForbiddenException(`Biometric ${dto.gate} gate returned NoMatch — account provisioning denied`);
    }

    // ── 3. BIOMETRIC_OK → PROVISIONING (60s mandate clock starts) ───────────
    const provisionStartedAt = new Date();
    await this.prisma.zfoeSession.update({
      where: { sessionRef },
      data: { status: ZFOE_BIOMETRIC_OK, biometricGate: dto.gate, nibssBiometricCorrId: biometricResult.correlationId },
    });
    await this.harvest.writeAudit(sessionRef, EVT_BIOMETRIC_OK, session.nibssTokenId, null, orgId,
      { gate: dto.gate, corrId: biometricResult.correlationId, sensorDeviceId: dto.sensorDeviceId });

    await this.prisma.zfoeSession.update({ where: { sessionRef }, data: { status: ZFOE_PROVISIONING, provisionStartedAt } });
    await this.harvest.writeAudit(sessionRef, EVT_PROVISION_STARTED, session.nibssTokenId, null, orgId,
      { bankCode: session.selectedBankCode, accountType: session.accountType });

    this.log.log(`[ZFOE][provision] sessionRef=${sessionRef} bank=${session.selectedBankCode} gate=${dto.gate}`);

    // ── 4. CBS Push via BankDirectoryService ─────────────────────────────────
    const bank    = this.bankDir.findByCode(session.selectedBankCode);
    const profile = this.harvest.decryptProfile(Buffer.from(session.shadowProfileBlob));

    const [firstName, lastName, middleName] = profile.fullName.split(" ");
    const cbsResult = await this.bankDir.pushToCbs(
      bank,
      { firstName: firstName ?? "", lastName: lastName ?? "", middleName: middleName ?? "",
        dateOfBirth: profile.dateOfBirth, gender: profile.gender,
        address: profile.verifiedAddress, nibssTokenId: session.nibssTokenId ?? "" },
      session.accountType,
    );

    // ── 5. Mandate compliance check ──────────────────────────────────────────
    const completedAt = new Date();
    const elapsedMs   = completedAt.getTime() - provisionStartedAt.getTime();
    const mandateMet  = elapsedMs <= ZFOE_PROVISION_MANDATE_MS;

    if (!mandateMet) {
      this.log.warn(`[ZFOE] 60s mandate BREACHED — sessionRef=${sessionRef} elapsedMs=${elapsedMs}`);
    }

    // ── 6. Update session + ZfoeAuditLog ─────────────────────────────────────
    await this.prisma.zfoeSession.update({
      where: { sessionRef },
      data: {
        status: ZFOE_COMPLETED, accountNumber: cbsResult.accountNumber,
        bankApiResponse: cbsResult.bankApiResponse, provisionStartedAt, completedAt,
        elapsedMs: Math.min(elapsedMs, 2_147_483_647), // INT max
      },
    });

    await this.harvest.writeAudit(
      sessionRef, EVT_ACCOUNT_MINTED, session.nibssTokenId, cbsResult.bankApiResponse, orgId,
      { accountNumber: cbsResult.accountNumber, bankName: bank.name, elapsedMs, mandateMet },
    );
    // Store the precise account gen timestamp in the audit row
    await this.prisma.zfoeAuditLog.create({
      data: { sessionRef, eventType: EVT_ACCOUNT_MINTED, nibssTokenId: session.nibssTokenId ?? null,
        bankApiResponse: cbsResult.bankApiResponse, accountGenTimestamp: completedAt,
        metadataJson: JSON.stringify({ accountNumber: cbsResult.accountNumber, elapsedMs, mandateMet }), orgId },
    });

    // ── 7. SMS / Push confirmation stub ──────────────────────────────────────
    this.bankDir.sendConfirmation(session.msisdnHash, cbsResult.accountNumber, bank.name, sessionRef);
    await this.harvest.writeAudit(sessionRef, EVT_SMS_DISPATCHED, session.nibssTokenId, null, orgId,
      { bankName: bank.name, accountNumber: cbsResult.accountNumber });

    this.log.log(`[ZFOE][complete] sessionRef=${sessionRef} account=${cbsResult.accountNumber} elapsedMs=${elapsedMs} mandateMet=${mandateMet}`);

    return {
      sessionRef, status: ZFOE_COMPLETED,
      accountNumber: cbsResult.accountNumber,
      bankName:      bank.name,
      bankCode:      bank.code,
      accountType:   session.accountType,
      biometricGate: dto.gate,
      nibssTokenId:  session.nibssTokenId,
      nibssCorrelationId: biometricResult.correlationId,
      elapsedMs, mandateMet,
      message: mandateMet
        ? `Account created in ${elapsedMs}ms — within the 60-second mandate. SMS confirmation dispatched.`
        : `Account created in ${elapsedMs}ms — 60-second mandate BREACHED. Audit flagged for review.`,
    };
  }
}

