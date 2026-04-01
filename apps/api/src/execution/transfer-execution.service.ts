import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BiometricExecutionService } from "./biometric-execution.service";
import { PulseSyncService } from "./pulse-sync.service";
import { defaultShardRegion } from "./crypto-env";
import { ConfigService } from "@nestjs/config";
import type { TransferExecuteDto } from "./dto/transfer-execute.dto";
import { EXEC_TRANSFER_POSTED, EXEC_TRANSFER_PROVISIONAL } from "./execution.constants";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class TransferExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biometric: BiometricExecutionService,
    private readonly pulse: PulseSyncService,
    private readonly config: ConfigService,
  ) {}

  async execute(dto: TransferExecuteDto) {
    if (dto.debitPublicRef === dto.creditPublicRef) {
      throw new BadRequestException("Debit and credit must differ");
    }
    const amount = new Decimal(dto.amountMinorUnits);
    if (amount.comparedTo(new Decimal(0)) <= 0) throw new BadRequestException("Amount must be positive");

    const online = !dto.offlineProvision;
    const orgId = "default";

    const result = await this.prisma.$transaction(async (tx) => {
      if (dto.idempotencyKey) {
        const existing = await tx.ledgerTransfer.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing) return { kind: "idempotent" as const, transfer: existing };
      }

      const debit = await tx.ledgerAccount.findUnique({ where: { publicRef: dto.debitPublicRef } });
      const credit = await tx.ledgerAccount.findUnique({ where: { publicRef: dto.creditPublicRef } });
      if (!debit || !credit) throw new BadRequestException("Unknown account");
      if (debit.currencyCode !== dto.currencyCode || credit.currencyCode !== dto.currencyCode) {
        throw new BadRequestException("Currency mismatch");
      }

      const { audit } = await this.biometric.authorizeExecutionOperation({
        online,
        debitAccountPublicRef: dto.debitPublicRef,
        bvn: dto.bvn,
        inline: dto.biometrics,
        validationHash: dto.biometricValidationHash,
        proofScopes: ["execute"],
      });

      const shard = debit.shardRegion ?? defaultShardRegion(this.config);
      const auditJson = JSON.stringify({ ...audit, offlineProvision: !!dto.offlineProvision });

      if (dto.offlineProvision) {
        const transfer = await tx.ledgerTransfer.create({
          data: {
            idempotencyKey: dto.idempotencyKey ?? null,
            debitAccountId: debit.id,
            creditAccountId: credit.id,
            amountMinor: amount,
            currencyCode: dto.currencyCode,
            narrative: dto.narrative ?? null,
            biometricAuditJson: auditJson,
            executionStatus: EXEC_TRANSFER_PROVISIONAL,
            shardRegion: shard,
            orgId,
          },
        });
        return { kind: "provisional" as const, transfer, debit, credit };
      }

      const newDebitBal = debit.balanceMinor.minus(amount);
      if (newDebitBal.comparedTo(new Decimal(0)) < 0) throw new BadRequestException("Insufficient balance");
      const newCreditBal = credit.balanceMinor.plus(amount);

      await tx.ledgerAccount.update({
        where: { id: debit.id },
        data: { balanceMinor: newDebitBal },
      });
      await tx.ledgerAccount.update({
        where: { id: credit.id },
        data: { balanceMinor: newCreditBal },
      });
      const transfer = await tx.ledgerTransfer.create({
        data: {
          idempotencyKey: dto.idempotencyKey ?? null,
          debitAccountId: debit.id,
          creditAccountId: credit.id,
          amountMinor: amount,
          currencyCode: dto.currencyCode,
          narrative: dto.narrative ?? null,
          biometricAuditJson: auditJson,
          executionStatus: EXEC_TRANSFER_POSTED,
          shardRegion: shard,
          orgId,
        },
      });
      return { kind: "posted" as const, transfer };
    });

    if (result.kind === "idempotent") {
      return { transferId: result.transfer.id, status: result.transfer.executionStatus, idempotent: true };
    }
    if (result.kind === "provisional") {
      const q = await this.pulse.enqueue("LEDGER_TRANSFER", result.transfer.id, {
        debit: dto.debitPublicRef,
        credit: dto.creditPublicRef,
        amount: dto.amountMinorUnits,
      });
      return {
        transferId: result.transfer.id,
        status: EXEC_TRANSFER_PROVISIONAL,
        pulseSyncQueueId: q.id,
        message: "Provisionally approved — will settle on Sovryn when device syncs",
      };
    }
    return { transferId: result.transfer.id, status: EXEC_TRANSFER_POSTED };
  }
}
