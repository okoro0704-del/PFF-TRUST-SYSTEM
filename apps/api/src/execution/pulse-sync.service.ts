import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { defaultShardRegion } from "./crypto-env";
import { ConfigService } from "@nestjs/config";
import { BILL_STATUS_SETTLED, EXEC_TRANSFER_POSTED } from "./execution.constants";
import { Decimal } from "@prisma/client/runtime/library";

/** Queue provisional movements for Sovryn / batch settlement when POS regains network heartbeat. */
@Injectable()
export class PulseSyncService {
  private readonly log = new Logger(PulseSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async enqueue(
    referenceType: "LEDGER_TRANSFER" | "BILL_PAYMENT" | "WITHDRAWAL",
    referenceId: string,
    payload: unknown,
  ) {
    const shard = defaultShardRegion(this.config);
    return this.prisma.pulseSyncQueue.create({
      data: {
        referenceType,
        referenceId,
        payloadJson: JSON.stringify(payload),
        status: "PENDING_SOVRYN",
        shardRegion: shard,
      },
    });
  }

  /** Stub: operator or worker marks Sovryn receipt. */
  async markSettled(queueId: string) {
    return this.prisma.pulseSyncQueue.update({
      where: { id: queueId },
      data: { status: "SETTLED", settledAt: new Date() },
    });
  }

  /**
   * Local Sync Protocol: after POS heartbeat (network restored), batch-post provisional ledger + bills.
   */
  async settlePendingForOrg(orgId: string): Promise<{ settled: number; skipped: number }> {
    await this.prisma.setOrgContext(orgId);
    const pending = await this.prisma.pulseSyncQueue.findMany({
      where: { status: "PENDING_SOVRYN" },
      take: 100,
      orderBy: { createdAt: "asc" },
    });
    let settled = 0;
    let skipped = 0;
    for (const q of pending) {
      try {
        if (q.referenceType === "LEDGER_TRANSFER") {
          const ok = await this.settleTransfer(q.id, q.referenceId, orgId);
          if (ok) settled++;
          else skipped++;
        } else if (q.referenceType === "BILL_PAYMENT") {
          const ok = await this.settleBill(q.id, q.referenceId, orgId);
          if (ok) settled++;
          else skipped++;
        } else {
          skipped++;
        }
      } catch (e) {
        this.log.warn(`Pulse settle failed for ${q.id}: ${e}`);
        skipped++;
      }
    }
    return { settled, skipped };
  }

  private async settleTransfer(queueId: string, transferId: string, orgId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.ledgerTransfer.findUnique({ where: { id: transferId } });
      if (!transfer || transfer.orgId !== orgId) return false;
      if (transfer.executionStatus !== "PROVISIONAL_PENDING_SOVRYN") return false;
      const debit = await tx.ledgerAccount.findUnique({ where: { id: transfer.debitAccountId } });
      const credit = await tx.ledgerAccount.findUnique({ where: { id: transfer.creditAccountId } });
      if (!debit || !credit) return false;
      const amt = transfer.amountMinor;
      const newD = debit.balanceMinor.minus(amt);
      if (newD.comparedTo(new Decimal(0)) < 0) return false;
      await tx.ledgerAccount.update({
        where: { id: debit.id },
        data: { balanceMinor: newD },
      });
      await tx.ledgerAccount.update({
        where: { id: credit.id },
        data: { balanceMinor: credit.balanceMinor.plus(amt) },
      });
      await tx.ledgerTransfer.update({
        where: { id: transfer.id },
        data: { executionStatus: EXEC_TRANSFER_POSTED },
      });
      await tx.pulseSyncQueue.update({
        where: { id: queueId },
        data: { status: "SETTLED", settledAt: new Date() },
      });
      return true;
    });
  }

  private async settleBill(queueId: string, billId: string, orgId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.billPayment.findUnique({ where: { id: billId } });
      if (!bill || bill.orgId !== orgId) return false;
      if (bill.status !== "PROVISIONAL_PENDING_SOVRYN") return false;
      const acc = await tx.ledgerAccount.findUnique({ where: { id: bill.accountId } });
      if (!acc) return false;
      const newBal = acc.balanceMinor.minus(bill.amountMinor);
      if (newBal.comparedTo(new Decimal(0)) < 0) return false;
      await tx.ledgerAccount.update({
        where: { id: acc.id },
        data: { balanceMinor: newBal },
      });
      await tx.billPayment.update({
        where: { id: bill.id },
        data: { status: BILL_STATUS_SETTLED },
      });
      await tx.pulseSyncQueue.update({
        where: { id: queueId },
        data: { status: "SETTLED", settledAt: new Date() },
      });
      return true;
    });
  }
}
