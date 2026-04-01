import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BihScanService } from "./bih-scan.service";
import type { AuthorizeOperationDto } from "./dto/authorize-operation.dto";
import {
  BIH_COMPLETED, BIH_FAILED, BIH_IDENTITY_UNLOCKED,
  EVT_GATE_AUTHORIZED, EVT_GATE_BILL_PAYMENT, EVT_GATE_DENIED,
  EVT_GATE_TRANSFER, EVT_GATE_WITHDRAWAL,
  PROV_SUCCESS, TXN_BILL_PAYMENT, TXN_TRANSFER, TXN_WITHDRAWAL,
} from "./bih.constants";

/**
 * BihGateService — Multi-Functional Biometric Gate.
 *
 * For existing accounts, the 1:N fingerprint match (already recorded on the session
 * at IDENTITY_UNLOCKED) is the primary authorization signal.  The gate validates:
 *   1. Session is IDENTITY_UNLOCKED (fingerprint already matched against NIBSS).
 *   2. Transaction type matches the operation DTO supplied.
 *   3. Required operation fields are present.
 *
 * Execution stubs (production: delegate to ExecutionModule / NIBSS payment rails):
 *   - WITHDRAWAL:    Debit customer account, release funds at agent POS.
 *   - TRANSFER:      Move funds to recipient NUBAN via NIBSS NIP gateway.
 *   - BILL_PAYMENT:  POST biller payload to NIBSS eBillsPay or VTPass.
 */
@Injectable()
export class BihGateService {
  private readonly log = new Logger(BihGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scan:   BihScanService,
  ) {}

  async authorizeOperation(scanRef: string, dto: AuthorizeOperationDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.scan.loadActive(scanRef, orgId, BIH_IDENTITY_UNLOCKED);
    await this.prisma.setOrgContext(orgId);

    const txnType = session.transactionType;

    // ── Validate operation fields match transaction type ─────────────────────
    if (txnType === TXN_WITHDRAWAL) {
      if (!dto.amountMinor) throw new BadRequestException("WITHDRAWAL requires amountMinor");
    } else if (txnType === TXN_TRANSFER) {
      if (!dto.amountMinor || !dto.recipientRef)
        throw new BadRequestException("TRANSFER requires amountMinor + recipientRef");
    } else if (txnType === TXN_BILL_PAYMENT) {
      if (!dto.amountMinor || !dto.billerCode)
        throw new BadRequestException("BILL_PAYMENT requires amountMinor + billerCode");
    } else {
      throw new BadRequestException(`Transaction type ${txnType} is not a gate operation. Use /v1/bih/:ref/provision for ACCOUNT_SETUP.`);
    }

    // Log gate initiation
    const gateEvent = txnType === TXN_WITHDRAWAL ? EVT_GATE_WITHDRAWAL
      : txnType === TXN_TRANSFER ? EVT_GATE_TRANSFER : EVT_GATE_BILL_PAYMENT;
    await this.scan.audit(scanRef, gateEvent, session.nibssMatchId, null, null, null, txnType,
      { amountMinor: dto.amountMinor, recipientRef: dto.recipientRef, billerCode: dto.billerCode }, orgId);

    // ── Execute operation stub ───────────────────────────────────────────────
    let operationResult: string;
    let success = true;
    const amountNaira = dto.amountMinor ? `₦${(dto.amountMinor / 100).toFixed(2)}` : "";

    try {
      if (txnType === TXN_WITHDRAWAL) {
        // Production: POST to /v1/execution/withdrawal with nibssMatchId + amountMinor
        // Stub: simulate 150–400ms execution
        await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
        operationResult = JSON.stringify({
          type: "WITHDRAWAL", amount: amountNaira, status: "AUTHORIZED",
          nibssRef: session.nibssMatchId, executedAt: new Date().toISOString(),
        });
      } else if (txnType === TXN_TRANSFER) {
        // Production: POST to NIBSS NIP gateway with encrypted transfer payload
        await new Promise(r => setTimeout(r, 200 + Math.random() * 600));
        operationResult = JSON.stringify({
          type: "TRANSFER", amount: amountNaira, recipient: dto.recipientRef,
          status: "AUTHORIZED", nipRef: `NIP-${Date.now()}`,
          nibssRef: session.nibssMatchId, executedAt: new Date().toISOString(),
        });
      } else {
        // Production: POST to NIBSS eBillsPay / VTPass
        await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
        operationResult = JSON.stringify({
          type: "BILL_PAYMENT", amount: amountNaira, biller: dto.billerCode,
          status: "SETTLED", billsPayRef: `BP-${Date.now()}`,
          nibssRef: session.nibssMatchId, executedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      success = false;
      operationResult = JSON.stringify({ type: txnType, status: "FAILED", error: String(err) });
    }

    // ── Persist result ───────────────────────────────────────────────────────
    const finalStatus = success ? BIH_COMPLETED : BIH_FAILED;
    const parsed = JSON.parse(operationResult) as Record<string, unknown>;

    await this.prisma.biometricScanSession.update({
      where: { scanRef },
      data: {
        status: finalStatus,
        operationAmountMinor:  dto.amountMinor ? BigInt(dto.amountMinor) : null,
        operationRecipientRef: dto.recipientRef ?? null,
        operationBillerCode:   dto.billerCode   ?? null,
        operationResult,
        completedAt: new Date(),
        bankProvisioningStatus: success ? PROV_SUCCESS : "FAILED",
      },
    });

    await this.scan.audit(scanRef, success ? EVT_GATE_AUTHORIZED : EVT_GATE_DENIED,
      session.nibssMatchId, null, null, success ? PROV_SUCCESS : "FAILED", txnType,
      { txnType, amountMinor: dto.amountMinor, recipientRef: dto.recipientRef, billerCode: dto.billerCode, success }, orgId);

    this.log.log(`[BIH][gate] scanRef=${scanRef} type=${txnType} success=${success}`);

    return {
      scanRef, status: finalStatus, transactionType: txnType,
      nibssMatchId: session.nibssMatchId, authorized: success,
      operation: parsed,
      message: success
        ? `${txnType} authorized via fingerprint — NIBSS 1:N match confirmed.`
        : `${txnType} execution failed. Session recorded for audit.`,
    };
  }
}

