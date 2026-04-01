import { IsInt, IsOptional, IsPositive, IsString, Matches, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Initiate a UNWP session for a standard BVN account.
 *
 * - No geospatial restriction (Mobility Freedom Rule).
 * - Server generates a Terminal-Linked Identifier (TLI) and a TOTP seed.
 * - A push notification / USSD overlay is sent to the BVN-linked phone.
 * - Returns: { sessionRef, tli, posDisplayCode, cognitiveTask, expiresAt }
 */
export class InitiateUnwpDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ description: "Agent BVN (11 digits)", example: "98765432109" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @ApiProperty({ description: "Opaque account reference (NUBAN or CBS ID)", example: "ACC-00123456" })
  @IsString()
  @MaxLength(64)
  accountPublicRef!: string;

  @ApiProperty({ description: "Withdrawal amount in kobo (minor units)", example: 500000 })
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiPropertyOptional({ description: "ISO 4217 currency code", example: "NGN", default: "NGN" })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  @ApiProperty({ description: "POS terminal hardware ID", example: "POS-ABUJA-0042" })
  @IsString()
  @MaxLength(64)
  terminalId!: string;

  @ApiPropertyOptional({ description: "BVN-linked phone device ID (for audit)", example: "DEV-SAMSUNG-XYZ" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

