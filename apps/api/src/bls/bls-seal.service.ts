import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NibssSearchService } from "../bih/nibss-search.service";
import { BlsDiscoveryService } from "./bls-discovery.service";
import type { SubmitSealScanDto } from "./dto/submit-seal-scan.dto";
import type { DiscoveredAccount } from "./bls-discovery.service";
import {
  BLS_AWAITING_SEAL, BLS_EXECUTED, BLS_FAILED,
  EVT_ACCOUNT_MAP_WIPED, EVT_CROSS_VALIDATION_FAILED,
  EVT_CROSS_VALIDATION_PASSED, EVT_EXECUTION_FAILED, EVT_EXECUTION_SUCCESS,
  EVT_NIBSS_SEAL_MATCHED, EVT_NIBSS_SEAL_NOMATCH, EVT_SEAL_ENCRYPTED,
  EVT_SEAL_PURGED, EVT_SEAL_SCAN_RECEIVED,
} from "./bls.constants";

/**
 * BlsSealService — Two-Step Biometric Seal & Zero-Knowledge Wipe.
 *
 * Core responsibilities:
 *   1. Receive second FAP-20 minutiae (raw template) → AES-256-GCM encrypt → NIBSS 1:N.
 *   2. Verify sealBvnHash === bvnAnchorHash (cross-validation: same person, two scans).
 *   3. Execute withdrawal (delegate to execution layer in production).
 *   4. Zero-knowledge wipe: accountMapBlob → NULL, stamp accountsWipedAt + templateDataPurgedAt.
 *   5. Audit: Discovery_Scan_ID + Selected_Bank_Code + Final_Authorization_Scan_ID.
 */
@Injectable()
export class BlsSealService {
  private readonly log = new Logger(BlsSealService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly nibss:      NibssSearchService,
    private readonly discovery:  BlsDiscoveryService,
  ) {}

  async submitSealScan(sessionRef: string, dto: SubmitSealScanDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.discovery.assertActive(sessionRef, orgId, BLS_AWAITING_SEAL);
    this.discovery.verifyToken(dto.sessionToken, sessionRef);

    if (!session.bvnAnchorHash) throw new BadRequestException("bvnAnchorHash missing from session — invalid state");
    if (!session.selectedAccountRef || !session.withdrawalAmountMinor)
      throw new BadRequestException("Account/amount not selected — invalid state");

    const raw = Buffer.from(dto.rawTemplateB64, "base64");

    // Encrypt → hash → NIBSS 1:N → purge
    const { hash: sealHash } = this.nibss.encryptTemplate(raw);
    await this.discovery.audit(sessionRef, EVT_SEAL_SCAN_RECEIVED, session.discoveryScanId, null, null, session.selectedBankCode,
      { sensorDeviceId: dto.sensorDeviceId, sealHash }, orgId);
    await this.discovery.audit(sessionRef, EVT_SEAL_ENCRYPTED, session.discoveryScanId, null, null, session.selectedBankCode,
      { sealHash }, orgId);

    const nibssResult = await this.nibss.searchByFingerprint(raw);
    const purgedAt    = new Date();
    await this.discovery.audit(sessionRef, EVT_SEAL_PURGED, session.discoveryScanId, null, null, session.selectedBankCode,
      { purgedAt: purgedAt.toISOString(), sealHash }, orgId);

    if (!nibssResult.matched || !nibssResult.identity) {
      await this.prisma.blsSession.update({ where: { sessionRef }, data: { status: BLS_FAILED, sealScanHash: sealHash } });
      await this.discovery.audit(sessionRef, EVT_NIBSS_SEAL_NOMATCH, session.discoveryScanId, null, nibssResult.latencyMs, session.selectedBankCode,
        { latencyMs: nibssResult.latencyMs }, orgId);
      throw new ForbiddenException("Final Authorization Scan returned NoMatch — withdrawal denied");
    }

    const sealScanId    = nibssResult.nibssMatchId!;
    const sealBvnHash   = createHash("sha256").update(sealScanId).digest("hex");
    const crossValidated = sealBvnHash === session.bvnAnchorHash;

    await this.prisma.blsSession.update({
      where: { sessionRef },
      data: { sealScanId, sealLatencyMs: nibssResult.latencyMs, sealScanHash: sealHash, crossValidationPassed: crossValidated },
    });

    await this.discovery.audit(sessionRef, EVT_NIBSS_SEAL_MATCHED, session.discoveryScanId, null, nibssResult.latencyMs, session.selectedBankCode,
      { latencyMs: nibssResult.latencyMs, sealScanId }, orgId);

    if (!crossValidated) {
      await this.prisma.blsSession.update({ where: { sessionRef }, data: { status: BLS_FAILED } });
      await this.discovery.audit(sessionRef, EVT_CROSS_VALIDATION_FAILED, session.discoveryScanId, null, null, session.selectedBankCode,
        { reason: "Discovery BVN anchor !== Seal BVN anchor" }, orgId);
      throw new ForbiddenException("Biometric cross-validation FAILED — Discovery Scan and Seal Scan are not from the same individual");
    }

    await this.discovery.audit(sessionRef, EVT_CROSS_VALIDATION_PASSED, session.discoveryScanId, null, null, session.selectedBankCode,
      { sealScanId }, orgId);
    this.log.log(`[BLS][seal] cross-validation PASSED sessionRef=${sessionRef} discoveryScanId=${session.discoveryScanId} sealScanId=${sealScanId}`);

    // ── Execute withdrawal stub (production: delegate to ExecutionModule / NIBSS debit gateway)
    let executionRef: string;
    let executionResult: string;
    let success = true;
    const amountNaira = `₦${(Number(session.withdrawalAmountMinor) / 100).toFixed(2)}`;

    try {
      // Decrypt account map to get full NUBAN
      if (!session.accountMapBlob) throw new Error("accountMapBlob missing");
      const accounts = this.discovery.decryptBlob<DiscoveredAccount[]>(Buffer.from(session.accountMapBlob));
      const chosen   = accounts.find(a => a.accountRef === session.selectedAccountRef);
      if (!chosen) throw new Error("selected account not found in decrypted map");

      // Stub execution: simulate CBS/NIBSS debit
      await new Promise(r => setTimeout(r, 100 + Math.random() * 400));
      executionRef = `BLS-EXEC-${randomUUID()}`;
      executionResult = JSON.stringify({
        type: "WITHDRAWAL", amount: amountNaira, accountRef: chosen.fullAccountRef,
        bankCode: chosen.bankCode, bankName: chosen.bankName,
        status: "AUTHORIZED", executionRef, discoveryScanId: session.discoveryScanId,
        sealScanId, executedAt: new Date().toISOString(),
      });
    } catch (err) {
      success = false;
      executionRef = `BLS-FAIL-${randomUUID()}`;
      executionResult = JSON.stringify({ type: "WITHDRAWAL", status: "FAILED", error: String(err) });
    }

    // ── Zero-knowledge wipe: NULL out accountMapBlob, stamp accountsWipedAt + templateDataPurgedAt
    const wipedAt = new Date();
    await this.prisma.blsSession.update({
      where: { sessionRef },
      data: {
        status: success ? BLS_EXECUTED : BLS_FAILED, executionRef, executionResult,
        accountMapBlob: null, accountsWipedAt: wipedAt, templateDataPurgedAt: wipedAt,
      },
    });

    if (success) {
      await this.discovery.audit(sessionRef, EVT_EXECUTION_SUCCESS, session.discoveryScanId, null, null, session.selectedBankCode,
        { executionRef, amountNaira }, orgId);
      // Compliance audit row with mandatory fields per spec
      await this.prisma.blsAuditLog.create({
        data: { sessionRef, eventType: EVT_EXECUTION_SUCCESS,
          discoveryScanId: session.discoveryScanId, selectedBankCode: session.selectedBankCode,
          finalAuthScanId: sealScanId, discoveryLatencyMs: session.discoveryLatencyMs, sealLatencyMs: nibssResult.latencyMs,
          metadataJson: JSON.stringify({ executionRef, amountNaira, crossValidated }), orgId },
      });
    } else {
      await this.discovery.audit(sessionRef, EVT_EXECUTION_FAILED, session.discoveryScanId, null, null, session.selectedBankCode,
        { executionRef, error: executionResult }, orgId);
    }

    await this.discovery.audit(sessionRef, EVT_ACCOUNT_MAP_WIPED, session.discoveryScanId, null, null, session.selectedBankCode,
      { wipedAt: wipedAt.toISOString() }, orgId);
    this.log.log(`[BLS][seal] execution ${success ? "SUCCESS" : "FAILED"} sessionRef=${sessionRef} executionRef=${executionRef}`);

    return {
      sessionRef, status: success ? BLS_EXECUTED : BLS_FAILED,
      discoveryScanId: session.discoveryScanId, finalAuthScanId: sealScanId,
      crossValidationPassed: true, executionRef, authorized: success,
      operation: JSON.parse(executionResult) as Record<string, unknown>,
      zeroKnowledgeCompliance: { accountMapWipedAt: wipedAt.toISOString(), templateDataPurgedAt: wipedAt.toISOString() },
      message: success
        ? `Withdrawal of ${amountNaira} AUTHORIZED. Discovery_Scan_ID: ${session.discoveryScanId}. Final_Authorization_Scan_ID: ${sealScanId}. Account map wiped. Session invalidated.`
        : `Execution failed. See execution_result. Session wiped.`,
    };
  }
}

