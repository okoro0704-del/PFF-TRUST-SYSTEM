import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { NibssFaceService, type BlideDiscoveredAccount } from "./nibss-face.service";
import { BlideLivenessService } from "./blide-liveness.service";
import type { InitiateSessionDto } from "./dto/initiate-session.dto";
import type { SubmitFaceTemplateDto } from "./dto/submit-face-template.dto";
import type { SelectTargetDto } from "./dto/select-target.dto";
import type { SubmitLivenessResponseDto } from "./dto/submit-liveness-response.dto";
import {
  BLIDE_ACCOUNTS_WIPED, BLIDE_COMPLETED, BLIDE_EXECUTING, BLIDE_FAILED,
  BLIDE_IDENTITY_UNLOCKED, BLIDE_INITIATED, BLIDE_LIVENESS_CHALLENGED,
  BLIDE_LIVENESS_FAILED, BLIDE_LIVENESS_VERIFIED, BLIDE_MANDATE_MS,
  BLIDE_NIBSS_MATCHED, BLIDE_NO_MATCH, BLIDE_SESSION_TTL_S, BLIDE_TARGET_SELECTED,
  EVT_BLIDE_ACCOUNT_MAP_BUILT, EVT_BLIDE_ACCOUNTS_WIPED, EVT_BLIDE_COMPLETED,
  EVT_BLIDE_EXECUTING, EVT_BLIDE_EXECUTION_FAILED, EVT_BLIDE_FACE_ENCRYPTED,
  EVT_BLIDE_FACE_PURGED, EVT_BLIDE_FACE_RECEIVED, EVT_BLIDE_IDENTITY_UNLOCKED,
  EVT_BLIDE_NIBSS_MATCHED, EVT_BLIDE_NIBSS_NO_MATCH, EVT_BLIDE_NIBSS_PING,
  EVT_BLIDE_SESSION_STARTED, EVT_BLIDE_TARGET_SELECTED,
} from "./blide.constants";
import { randomUUID } from "node:crypto";

@Injectable()
export class BlideExecutionService {
  private readonly log = new Logger(BlideExecutionService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly face:      NibssFaceService,
    private readonly liveness:  BlideLivenessService,
    private readonly bankDir:   BankDirectoryService,
  ) {}

  // ── Step 0 ──────────────────────────────────────────────────────────────────
  async initiate(dto: InitiateSessionDto) {
    const orgId      = dto.orgId ?? "default";
    const sessionRef = `BLIDE-${randomUUID()}`;
    const expiresAt  = new Date(Date.now() + BLIDE_SESSION_TTL_S * 1000);
    await this.prisma.setOrgContext(orgId);
    await this.prisma.blideSession.create({
      data: { sessionRef, transactionType: dto.transactionType, status: BLIDE_INITIATED, sessionExpiresAt: expiresAt, orgId },
    });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_SESSION_STARTED, null, null, null, dto.transactionType, orgId,
      { transactionType: dto.transactionType });
    return { sessionRef, transactionType: dto.transactionType, expiresAt,
      instruction: "Activate camera. Capture face frame and POST rawFaceTemplateB64 to /v1/blide/:ref/face." };
  }

  // ── Step 1: Face Scan ───────────────────────────────────────────────────────
  async submitFaceTemplate(sessionRef: string, dto: SubmitFaceTemplateDto) {
    const orgId  = dto.orgId ?? "default";
    const session = await this.loadActive(sessionRef, orgId, BLIDE_INITIATED);
    const rawFrame = Buffer.from(dto.rawFaceTemplateB64, "base64");

    // Encrypt before NIBSS transit — hash for audit — purge reference
    const { hash: faceTemplateHash } = this.face.encryptFaceTemplate(rawFrame);
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_FACE_RECEIVED, null, null, null, session.transactionType, orgId,
      { cameraDeviceId: dto.cameraDeviceId, faceFormat: dto.faceFormat, faceTemplateHash });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_FACE_ENCRYPTED, null, null, null, session.transactionType, orgId,
      { faceTemplateHash });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_NIBSS_PING, null, null, null, session.transactionType, orgId, {});

    const nibssResult = await this.face.searchByFace(rawFrame, session.transactionType);
    const purgedAt    = new Date(); // raw frame out of scope

    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_FACE_PURGED, null, null, null, session.transactionType, orgId,
      { purgedAt: purgedAt.toISOString(), faceTemplateHash });

    if (!nibssResult.matched || !nibssResult.identity) {
      await this.prisma.blideSession.update({ where: { sessionRef },
        data: { status: BLIDE_NO_MATCH, faceTemplateHash, faceTemplatePurgedAt: purgedAt } });
      await this.liveness.writeAudit(sessionRef, EVT_BLIDE_NIBSS_NO_MATCH, null, null, null, session.transactionType, orgId,
        { latencyMs: nibssResult.latencyMs });
      throw new ForbiddenException("Face not found in NIBSS national registry — identity not verified");
    }

    const nibssMatchedAt = new Date();
    const { faceMatchId, identity, accounts, latencyMs } = nibssResult;

    // Build encrypted blob based on transaction type
    const isSetup = session.transactionType === "ACCOUNT_SETUP";
    const shadowProfileBlob = isSetup ? this.face.encryptBlob(identity) : null;
    const accountMapBlob    = !isSetup && accounts ? this.face.encryptBlob(accounts) : null;

    await this.prisma.blideSession.update({ where: { sessionRef }, data: {
      status: BLIDE_IDENTITY_UNLOCKED, faceMatchId, faceLatencyMs: latencyMs,
      faceTemplateHash, faceTemplatePurgedAt: purgedAt, nibssMatchedAt,
      shadowProfileBlob: shadowProfileBlob ?? undefined,
      accountMapBlob:    accountMapBlob    ?? undefined,
    }});

    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_NIBSS_MATCHED, faceMatchId, null, null, session.transactionType, orgId,
      { latencyMs, stateOfOrigin: identity.stateOfOrigin });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_IDENTITY_UNLOCKED, faceMatchId, null, null, session.transactionType, orgId, {});
    if (!isSetup && accounts) {
      await this.liveness.writeAudit(sessionRef, EVT_BLIDE_ACCOUNT_MAP_BUILT, faceMatchId, null, null, session.transactionType, orgId,
        { accountCount: accounts.length });
    }

    const maskedAccounts = accounts?.map(({ fullAccountRef: _, ...a }) => a) ?? null;
    this.log.log(`[BLIDE] face matched sessionRef=${sessionRef} faceMatchId=${faceMatchId} latencyMs=${latencyMs}`);
    return {
      sessionRef, status: BLIDE_IDENTITY_UNLOCKED, faceMatchId, faceLatencyMs: latencyMs,
      transactionType: session.transactionType,
      identityPreview: isSetup ? {
        fullName: identity.fullName, dateOfBirth: identity.dateOfBirth,
        gender: identity.gender, stateOfOrigin: identity.stateOfOrigin,
        addressSummary: identity.address.split(",")[0],
      } : null,
      accounts: maskedAccounts,
      bankDirectory: isSetup ? this.bankDir.listBanks() : null,
      message: isSetup
        ? "Identity unlocked. Select bank and account type — zero-input rule applies."
        : `${accounts?.length ?? 0} accounts discovered. Select source account and enter amount.`,
    };
  }

  // ── Step 2: Target Selection → issue liveness challenge ────────────────────
  async selectTarget(sessionRef: string, dto: SelectTargetDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadActive(sessionRef, orgId, BLIDE_IDENTITY_UNLOCKED);
    const isSetup = session.transactionType === "ACCOUNT_SETUP";

    let selectedBankCode: string | null = null, selectedBankName: string | null = null;
    let selectedAccountRef: string | null = null, selectedAccountType: string | null = null;
    let amountMinor: bigint | null = null;

    if (isSetup) {
      if (!dto.bankCode) throw new BadRequestException("bankCode required for ACCOUNT_SETUP");
      const bank = this.bankDir.findByCode(dto.bankCode);
      selectedBankCode = bank.code; selectedBankName = bank.name;
      selectedAccountType = dto.accountType ?? "SAVINGS";
    } else {
      if (!dto.selectedAccountRef) throw new BadRequestException("selectedAccountRef required");
      if (!dto.amountMinor)        throw new BadRequestException("amountMinor required");
      if (!session.accountMapBlob) throw new BadRequestException("Account map missing");
      const accounts = this.face.decryptBlob<BlideDiscoveredAccount[]>(Buffer.from(session.accountMapBlob));
      const chosen   = accounts.find(a => a.accountRef === dto.selectedAccountRef);
      if (!chosen) throw new BadRequestException(`Account ${dto.selectedAccountRef} not found`);
      if (dto.amountMinor > chosen.balanceMinor) throw new BadRequestException("Insufficient balance");
      selectedAccountRef = chosen.accountRef; selectedBankCode = chosen.bankCode; selectedBankName = chosen.bankName;
      amountMinor = BigInt(dto.amountMinor);
    }

    await this.prisma.blideSession.update({ where: { sessionRef }, data: {
      status: BLIDE_LIVENESS_CHALLENGED, selectedBankCode, selectedBankName,
      selectedAccountRef, selectedAccountType, operationAmountMinor: amountMinor,
      recipientRef: dto.recipientRef ?? null, billerCode: dto.billerCode ?? null,
    }});
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_TARGET_SELECTED, session.faceMatchId, null, null, session.transactionType, orgId,
      { bankCode: selectedBankCode, accountRef: selectedAccountRef, amountMinor: amountMinor?.toString() });

    const challenge = await this.liveness.issueLivenessChallenge(sessionRef, orgId);
    await this.liveness.writeAudit(sessionRef, BLIDE_LIVENESS_CHALLENGED, session.faceMatchId, challenge.challengeType, null, session.transactionType, orgId,
      { challengeId: challenge.challengeId });

    const elapsed = Date.now() - (session.nibssMatchedAt?.getTime() ?? Date.now());
    return {
      sessionRef, status: BLIDE_LIVENESS_CHALLENGED, faceMatchId: session.faceMatchId,
      liveness: challenge,
      elapsedSinceMatchMs: elapsed,
      remainingMandateMs: Math.max(0, BLIDE_MANDATE_MS - elapsed),
      message: `Liveness challenge issued: "${challenge.prompt}". ${Math.round((BLIDE_MANDATE_MS - elapsed) / 1000)}s remaining in sub-60s mandate.`,
    };
  }

  // ── Step 3: Liveness Response → Execute ────────────────────────────────────
  async submitLivenessResponse(sessionRef: string, dto: SubmitLivenessResponseDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.loadActive(sessionRef, orgId, BLIDE_LIVENESS_CHALLENGED);

    // Verify liveness (frames processed in-memory — zero persistence)
    const livenessResult = await this.liveness.verifyLivenessResponse(
      sessionRef, dto.challengeId, dto.responseFramesB64, orgId);

    const livenessVerifiedAt = new Date();
    await this.prisma.blideSession.update({ where: { sessionRef }, data: {
      status: BLIDE_LIVENESS_VERIFIED, livenessVerified: true,
      livenessVerifiedAt, completedChallengeType: livenessResult.challengeType,
    }});

    // Check sub-60s mandate
    const elapsed = Date.now() - (session.nibssMatchedAt?.getTime() ?? Date.now());
    if (elapsed > BLIDE_MANDATE_MS) {
      this.log.warn(`[BLIDE] sub-60s mandate BREACHED sessionRef=${sessionRef} elapsedMs=${elapsed}`);
    }

    // Execute transaction
    await this.prisma.blideSession.update({ where: { sessionRef }, data: { status: BLIDE_EXECUTING } });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_EXECUTING, session.faceMatchId, livenessResult.challengeType, true, session.transactionType, orgId, {});

    let accountNumber: string | null = null;
    let executionRef: string | null  = null;
    let executionResult: string | null = null;
    let success = true;

    try {
      if (session.transactionType === "ACCOUNT_SETUP") {
        if (!session.shadowProfileBlob || !session.selectedBankCode) throw new Error("Missing provisioning data");
        const identity = this.face.decryptBlob<{ firstName:string; lastName:string; middleName:string; dateOfBirth:string; gender:string; address:string }>(Buffer.from(session.shadowProfileBlob));
        const bank     = this.bankDir.findByCode(session.selectedBankCode);
        const cbsResult = await this.bankDir.pushToCbs(bank, {
          firstName: identity.firstName, lastName: identity.lastName, middleName: identity.middleName,
          dateOfBirth: identity.dateOfBirth, gender: identity.gender, address: identity.address,
          nibssTokenId: session.faceMatchId ?? "",
        }, session.selectedAccountType ?? "SAVINGS");
        accountNumber  = cbsResult.accountNumber;
        executionResult = cbsResult.bankApiResponse;
      } else {
        await new Promise(r => setTimeout(r, 100 + Math.random() * 400));
        executionRef   = `BLIDE-EXEC-${randomUUID()}`;
        const amountNaira = `₦${(Number(session.operationAmountMinor ?? 0) / 100).toFixed(2)}`;
        executionResult = JSON.stringify({
          type: session.transactionType, amount: amountNaira,
          accountRef: session.selectedAccountRef, bank: session.selectedBankName,
          recipientRef: session.recipientRef, billerCode: session.billerCode,
          status: "AUTHORIZED", executionRef, faceMatchId: session.faceMatchId,
          livenessVerified: true, challengeType: livenessResult.challengeType,
          executedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      success = false; executionResult = JSON.stringify({ status: "FAILED", error: String(err) });
    }

    const completedAt   = new Date();
    const totalElapsedMs = completedAt.getTime() - (session.nibssMatchedAt?.getTime() ?? completedAt.getTime());
    const mandateMet    = totalElapsedMs <= BLIDE_MANDATE_MS;
    const wipedAt       = new Date();

    await this.prisma.blideSession.update({ where: { sessionRef }, data: {
      status: success ? BLIDE_COMPLETED : BLIDE_FAILED,
      accountNumber, executionRef, executionResult,
      completedAt, totalElapsedMs: Math.min(totalElapsedMs, 2_147_483_647), mandateMet,
      accountMapBlob: null, accountsWipedAt: wipedAt,
    }});

    const auditEvt = success ? EVT_BLIDE_COMPLETED : EVT_BLIDE_EXECUTION_FAILED;
    await this.liveness.writeAudit(sessionRef, auditEvt, session.faceMatchId, livenessResult.challengeType, true, session.transactionType, orgId,
      { accountNumber, executionRef, totalElapsedMs, mandateMet });
    await this.liveness.writeAudit(sessionRef, EVT_BLIDE_ACCOUNTS_WIPED, session.faceMatchId, null, null, session.transactionType, orgId,
      { wipedAt: wipedAt.toISOString() });

    this.log.log(`[BLIDE] ${success ? "COMPLETED" : "FAILED"} sessionRef=${sessionRef} elapsedMs=${totalElapsedMs} mandateMet=${mandateMet}`);
    return {
      sessionRef, status: success ? BLIDE_COMPLETED : BLIDE_FAILED,
      transactionType: session.transactionType, faceMatchId: session.faceMatchId,
      livenessVerified: true, completedChallengeType: livenessResult.challengeType,
      accountNumber, executionRef, totalElapsedMs, mandateMet,
      zeroKnowledgeLiveness: true,
      zeroKnowledgeAccounts: { wipedAt: wipedAt.toISOString() },
      message: success
        ? (session.transactionType === "ACCOUNT_SETUP"
            ? `Account ${accountNumber ?? ""} created in ${totalElapsedMs}ms. Liveness_Verified: TRUE.`
            : `${session.transactionType} authorized in ${totalElapsedMs}ms. ${mandateMet ? "Sub-60s mandate met." : "Mandate breached — flagged."} Liveness_Verified: TRUE.`)
        : `Execution failed. Liveness_Verified: TRUE. Session data wiped.`,
    };
  }

  async loadActive(sessionRef: string, orgId: string, requiredStatus?: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.blideSession.findUnique({ where: { sessionRef } });
    if (!s) throw new BadRequestException("BLIDE session not found");
    if (s.sessionExpiresAt < new Date()) throw new BadRequestException("BLIDE session expired");
    if (requiredStatus && s.status !== requiredStatus)
      throw new BadRequestException(`Expected status ${requiredStatus}, got ${s.status}`);
    return s;
  }

  async getStatus(sessionRef: string, orgId: string) {
    const s = await this.loadActive(sessionRef, orgId);
    return {
      sessionRef: s.sessionRef, status: s.status, transactionType: s.transactionType,
      faceMatchId: s.faceMatchId, livenessVerified: s.livenessVerified,
      completedChallengeType: s.completedChallengeType,
      totalElapsedMs: s.totalElapsedMs, mandateMet: s.mandateMet,
    };
  }
}

