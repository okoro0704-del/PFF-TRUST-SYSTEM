import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BiometricExecutionService } from "./biometric-execution.service";
import { PulseSyncService } from "./pulse-sync.service";
import { defaultShardRegion } from "./crypto-env";
import { ConfigService } from "@nestjs/config";
import type { BillsPayDto } from "./dto/bills-pay.dto";
import { BILL_STATUS_PROVISIONAL, BILL_STATUS_SETTLED } from "./execution.constants";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class BillsExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biometric: BiometricExecutionService,
    private readonly pulse: PulseSyncService,
    private readonly config: ConfigService,
  ) {}

  /** VIDA CAP exchange — instant utility settlement when online; Pulse when offline. */
  async pay(dto: BillsPayDto) {
    const orgId = dto.orgId ?? "default";
    const amount = new Decimal(dto.amountMinorUnits);
    if (amount.comparedTo(new Decimal(0)) <= 0) throw new BadRequestException("Amount must be positive");

    const acc = await this.prisma.ledgerAccount.findUnique({ where: { publicRef: dto.accountPublicRef } });
    if (!acc) throw new BadRequestException("Account not found");
    if (acc.currencyCode !== dto.currencyCode) throw new BadRequestException("Currency mismatch");

    const online = !dto.offlineProvision;
    const { audit } = await this.biometric.authorizeExecutionOperation({
      online,
      debitAccountPublicRef: dto.accountPublicRef,
      bvn: dto.bvn,
      inline: dto.biometrics,
      validationHash: dto.biometricValidationHash,
      proofScopes: ["pay"],
    });

    const vcapReference = `VIDA-CAP-${randomUUID()}`;
    const shard = acc.shardRegion ?? defaultShardRegion(this.config);
    const auditJson = JSON.stringify({ ...audit, utilityCode: dto.utilityCode, vcapReference });

    if (dto.idempotencyKey) {
      const existing = await this.prisma.billPayment.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
      if (existing) {
        return {
          billPaymentId: existing.id,
          vcapReference: existing.vcapReference,
          status: existing.status,
          idempotent: true,
        };
      }
    }

    if (dto.offlineProvision) {
      const bill = await this.prisma.billPayment.create({
        data: {
          idempotencyKey: dto.idempotencyKey ?? null,
          accountId: acc.id,
          amountMinor: amount,
          currencyCode: dto.currencyCode,
          vcapReference,
          utilityCode: dto.utilityCode,
          biometricAuditJson: auditJson,
          status: BILL_STATUS_PROVISIONAL,
          shardRegion: shard,
          orgId,
        },
      });
      const q = await this.pulse.enqueue("BILL_PAYMENT", bill.id, {
        account: dto.accountPublicRef,
        amount: dto.amountMinorUnits,
        utilityCode: dto.utilityCode,
      });
      return {
        billPaymentId: bill.id,
        vcapReference,
        status: BILL_STATUS_PROVISIONAL,
        pulseSyncQueueId: q.id,
        message: "Provisionally approved via Pulse — VIDA CAP settlement on sync",
      };
    }

    const newBal = acc.balanceMinor.minus(amount);
    if (newBal.comparedTo(new Decimal(0)) < 0) throw new BadRequestException("Insufficient balance");
    await this.prisma.ledgerAccount.update({
      where: { id: acc.id },
      data: { balanceMinor: newBal },
    });
    const bill = await this.prisma.billPayment.create({
      data: {
        idempotencyKey: dto.idempotencyKey ?? null,
        accountId: acc.id,
        amountMinor: amount,
        currencyCode: dto.currencyCode,
        vcapReference,
        utilityCode: dto.utilityCode,
        biometricAuditJson: auditJson,
        status: BILL_STATUS_SETTLED,
        shardRegion: shard,
        orgId,
      },
    });
    return { billPaymentId: bill.id, vcapReference, status: BILL_STATUS_SETTLED };
  }
}
