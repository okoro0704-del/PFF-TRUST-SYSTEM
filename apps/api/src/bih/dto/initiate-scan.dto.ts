import { IsEnum, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TXN_ACCOUNT_SETUP, TXN_BILL_PAYMENT, TXN_TRANSFER, TXN_WITHDRAWAL } from "../bih.constants";

export enum BihTransactionType {
  ACCOUNT_SETUP = TXN_ACCOUNT_SETUP,
  WITHDRAWAL    = TXN_WITHDRAWAL,
  TRANSFER      = TXN_TRANSFER,
  BILL_PAYMENT  = TXN_BILL_PAYMENT,
}

/**
 * Step 0 — Declare transaction intent and prime the scan session.
 * Returns { scanRef, expiresAt } → client captures fingerprint and calls POST /v1/bih/:ref/template.
 */
export class InitiateScanDto {
  @ApiProperty({
    enum: BihTransactionType,
    description:
      "Transaction type — determines the downstream gate. " +
      "ACCOUNT_SETUP: triggers Zero-Input Onboarding. " +
      "WITHDRAWAL/TRANSFER/BILL_PAYMENT: triggers the Multi-Functional Biometric Gate.",
    example: BihTransactionType.ACCOUNT_SETUP,
  })
  @IsEnum(BihTransactionType)
  transactionType!: BihTransactionType;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

