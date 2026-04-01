import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Multi-Functional Biometric Gate — Operation Authorization.
 *
 * Used for WITHDRAWAL, TRANSFER, and BILL_PAYMENT after the fingerprint
 * 1:N NIBSS search has already matched the user's identity.
 *
 * The scan session (NIBSS_MATCHED) provides the identity context.
 * Only the operation-specific fields below are accepted — no identity fields.
 *
 * WITHDRAWAL:    provide amountMinor only.
 * TRANSFER:      provide amountMinor + recipientRef.
 * BILL_PAYMENT:  provide amountMinor + billerCode.
 */
export class AuthorizeOperationDto {
  @ApiPropertyOptional({
    description: "Withdrawal / transfer / bill amount in minor units (kobo)",
    example: 500000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amountMinor?: number;

  @ApiPropertyOptional({
    description: "Recipient account reference for TRANSFER (NUBAN or CBS ID)",
    example: "0123456789",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  recipientRef?: string;

  @ApiPropertyOptional({
    description: "Biller code for BILL_PAYMENT (e.g. 'EKEDC-PREPAID', 'DSTV-COMPACT')",
    example: "EKEDC-PREPAID",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  billerCode?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

