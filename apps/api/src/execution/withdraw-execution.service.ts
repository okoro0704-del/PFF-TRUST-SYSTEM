import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BiometricExecutionService } from "./biometric-execution.service";
import { defaultShardRegion } from "./crypto-env";
import { ConfigService } from "@nestjs/config";
import type { WithdrawAuthorizeDto } from "./dto/withdraw-authorize.dto";
import type { WithdrawRedeemDto } from "./dto/withdraw-redeem.dto";
import { WITHDRAW_ACTIVE, WITHDRAW_REDEEMED } from "./execution.constants";
import { Decimal } from "@prisma/client/runtime/library";

@Injectable()
export class WithdrawExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biometric: BiometricExecutionService,
    private readonly config: ConfigService,
  ) {}

  /** Cardless POS/ATM: biometric payout token (no PIN). */
  async authorize(dto: WithdrawAuthorizeDto) {
    const orgId = dto.orgId ?? "default";
    const amount = new Decimal(dto.amountMinorUnits);
    if (amount.comparedTo(new Decimal(0)) <= 0) throw new BadRequestException("Amount must be positive");

    const acc = await this.prisma.ledgerAccount.findUnique({ where: { publicRef: dto.accountPublicRef } });
    if (!acc) throw new BadRequestException("Account not found");
    if (acc.orgId !== orgId) throw new BadRequestException("Org mismatch");
    if (acc.currencyCode !== dto.currencyCode) throw new BadRequestException("Currency mismatch");
    if (acc.balanceMinor.comparedTo(amount) < 0) throw new BadRequestException("Insufficient balance");

    const { audit } = await this.biometric.authorizeExecutionOperation({
      online: true,
      debitAccountPublicRef: dto.accountPublicRef,
      bvn: dto.bvn,
      inline: dto.biometrics,
      validationHash: dto.biometricValidationHash,
      proofScopes: ["withdraw"],
    });

    const shard = acc.shardRegion ?? defaultShardRegion(this.config);
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const row = await this.prisma.withdrawalAuthorization.create({
      data: {
        token,
        accountId: acc.id,
        amountMinor: amount,
        currencyCode: dto.currencyCode,
        channel: dto.channel,
        biometricAuditJson: JSON.stringify(audit),
        status: WITHDRAW_ACTIVE,
        expiresAt,
        shardRegion: shard,
        orgId,
      },
    });

    return {
      payoutToken: row.token,
      expiresAt: row.expiresAt.toISOString(),
      channel: dto.channel,
      amountMinorUnits: dto.amountMinorUnits,
      currencyCode: dto.currencyCode,
    };
  }

  /**
   * ATM / POS Token Redemption — POST /withdraw/redeem
   *
   * Atomically:
   *   1. Validates token is ACTIVE and not expired.
   *   2. Re-checks account balance inside the transaction (TOCTOU safe).
   *   3. Debits LedgerAccount.balanceMinor.
   *   4. Marks WithdrawalAuthorization as REDEEMED with timestamp + channel.
   */
  async redeemToken(dto: WithdrawRedeemDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);

    const auth = await this.prisma.withdrawalAuthorization.findUnique({
      where:   { token: dto.payoutToken },
      include: { account: true },
    });
    if (!auth)                           throw new BadRequestException("Payout token not found");
    if (auth.orgId !== orgId)            throw new BadRequestException("Org mismatch");
    if (auth.status === WITHDRAW_REDEEMED) throw new BadRequestException("Token already redeemed");
    if (auth.status !== WITHDRAW_ACTIVE) throw new BadRequestException("Token is not active");
    if (auth.expiresAt < new Date())     throw new BadRequestException("Token expired — request a new one via /withdraw/authorize");

    const result = await this.prisma.$transaction(async (tx) => {
      // Re-fetch balance inside transaction to prevent TOCTOU race
      const acc = await tx.ledgerAccount.findUnique({ where: { id: auth.accountId } });
      if (!acc) throw new BadRequestException("Account not found");
      if (acc.balanceMinor.comparedTo(auth.amountMinor) < 0) {
        throw new BadRequestException("Insufficient balance at redemption time");
      }

      // Debit account
      await tx.ledgerAccount.update({
        where: { id: auth.accountId },
        data:  { balanceMinor: acc.balanceMinor.sub(auth.amountMinor) },
      });

      // Mark redeemed
      return tx.withdrawalAuthorization.update({
        where: { id: auth.id },
        data:  {
          status:            WITHDRAW_REDEEMED,
          redeemedAt:        new Date(),
          redemptionChannel: dto.channel,
        },
      });
    });

    return {
      redeemed:         true,
      payoutToken:      result.token,
      amountMinorUnits: result.amountMinor.toString(),
      currencyCode:     result.currencyCode,
      channel:          result.redemptionChannel,
      redeemedAt:       result.redeemedAt?.toISOString(),
    };
  }
}
