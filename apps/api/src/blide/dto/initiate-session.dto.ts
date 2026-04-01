import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  BLIDE_TXN_ACCOUNT_SETUP, BLIDE_TXN_BILL_PAYMENT,
  BLIDE_TXN_TRANSFER, BLIDE_TXN_WITHDRAWAL,
} from "../blide.constants";

export enum BlideTransactionType {
  ACCOUNT_SETUP = BLIDE_TXN_ACCOUNT_SETUP,
  WITHDRAWAL    = BLIDE_TXN_WITHDRAWAL,
  TRANSFER      = BLIDE_TXN_TRANSFER,
  BILL_PAYMENT  = BLIDE_TXN_BILL_PAYMENT,
}

/**
 * Step 0 — Prime a BLIDE Face Pay session and declare transaction intent.
 *
 * ACCOUNT_SETUP → NIBSS feeds demographic data → zero-input CBS account creation.
 * WITHDRAWAL | TRANSFER | BILL_PAYMENT → NIBSS feeds account map (sorted desc by balance).
 *
 * Returns { sessionRef, expiresAt } — client activates camera immediately.
 */
export class InitiateSessionDto {
  @ApiProperty({
    enum: BlideTransactionType,
    description:
      "Transaction type. ACCOUNT_SETUP: triggers NIBSS identity feed + zero-input onboarding. " +
      "WITHDRAWAL/TRANSFER/BILL_PAYMENT: triggers NIBSS account map feed + liveness gate.",
    example: BlideTransactionType.WITHDRAWAL,
  })
  @IsEnum(BlideTransactionType)
  transactionType!: BlideTransactionType;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

