import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { WITHDRAW_ACTIVE, WITHDRAW_EXPIRED } from "./execution.constants";

/**
 * Token Expiry Sweeper — runs every minute.
 *
 * Marks all WithdrawalAuthorization rows with status=ACTIVE whose
 * expiresAt has passed as EXPIRED.
 *
 * This closes the ACTIVE → EXPIRED state machine transition that
 * POST /withdraw/redeem guards against, and keeps analytics accurate:
 * expired tokens are distinct from redeemed tokens in the ledger.
 *
 * Africa/Lagos timezone aligns with the 06:00 WAT daily lock pattern
 * used by TerminalLockScheduler.
 */
@Injectable()
export class TokenExpirySweeper {
  private readonly log = new Logger(TokenExpirySweeper.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: "Africa/Lagos" })
  async sweepExpiredTokens(): Promise<void> {
    const result = await this.prisma.withdrawalAuthorization.updateMany({
      where: {
        status:    WITHDRAW_ACTIVE,
        expiresAt: { lt: new Date() },
      },
      data: { status: WITHDRAW_EXPIRED },
    });

    if (result.count > 0) {
      this.log.log(
        `[TokenSweeper] Marked ${result.count} withdrawal token(s) EXPIRED ` +
        `(${new Date().toISOString()})`,
      );
    }
  }

  /** Exposed for admin health-check: count of tokens in each status bucket. */
  async statusSummary() {
    const [active, redeemed, expired] = await Promise.all([
      this.prisma.withdrawalAuthorization.count({ where: { status: WITHDRAW_ACTIVE } }),
      this.prisma.withdrawalAuthorization.count({ where: { status: WITHDRAW_EXPIRED } }),
      this.prisma.withdrawalAuthorization.count({ where: { status: "REDEEMED" } }),
    ]);
    return { active, redeemed, expired };
  }
}

