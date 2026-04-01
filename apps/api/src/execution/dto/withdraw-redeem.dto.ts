import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * ATM / POS withdrawal token redemption.
 * Consumes the ACTIVE payout token minted by POST /withdraw/authorize,
 * debits the account balance, and marks the token REDEEMED.
 */
export class WithdrawRedeemDto {
  /** 48-char hex token returned by /withdraw/authorize. */
  @IsString()
  @IsNotEmpty()
  payoutToken!: string;

  /** Physical channel consuming the token. */
  @IsIn(["POS", "ATM"])
  channel!: "POS" | "ATM";

  @IsOptional()
  @IsString()
  orgId?: string;
}

