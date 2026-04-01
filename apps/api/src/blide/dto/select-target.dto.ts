import { IsEnum, IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum BlideAccountTypeEnum { SAVINGS = "SAVINGS", CURRENT = "CURRENT" }

/**
 * Step 2 — Target Selection.
 *
 * ACCOUNT_SETUP:
 *   Provide bankCode + accountType ONLY.
 *   NO identity fields (name, DOB, address) — NIBSS shadow profile is the Absolute Source of Truth.
 *   The server pulls demographics from shadowProfileBlob exclusively.
 *
 * WITHDRAWAL / TRANSFER / BILL_PAYMENT:
 *   Provide selectedAccountRef (from discovered map) + amountMinor.
 *   TRANSFER additionally requires recipientRef.
 *   BILL_PAYMENT additionally requires billerCode.
 *
 * After this call, the server issues a randomized Liveness Challenge.
 * The sub-60-second mandate clock started at nibssMatchedAt (Step 1 match).
 */
export class SelectTargetDto {
  // ── ACCOUNT_SETUP fields ──────────────────────────────────────────────────
  @ApiPropertyOptional({ description: "CBN/BoG bank sort code (ACCOUNT_SETUP only)", example: "058063220" })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  bankCode?: string;

  @ApiPropertyOptional({ enum: BlideAccountTypeEnum, example: BlideAccountTypeEnum.SAVINGS })
  @IsOptional()
  @IsEnum(BlideAccountTypeEnum)
  accountType?: BlideAccountTypeEnum;

  // ── Financial transaction fields ──────────────────────────────────────────
  @ApiPropertyOptional({ description: "Masked account ref from discovery (e.g. '****7890')", example: "****7890" })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  selectedAccountRef?: string;

  @ApiPropertyOptional({ description: "Amount in minor units (kobo)", example: 500000 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amountMinor?: number;

  @ApiPropertyOptional({ description: "Recipient NUBAN (TRANSFER only)", example: "0123456789" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientRef?: string;

  @ApiPropertyOptional({ description: "Biller code (BILL_PAYMENT only)", example: "EKEDC-PREPAID" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  billerCode?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

