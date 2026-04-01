import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum BihAccountType { SAVINGS = "SAVINGS", CURRENT = "CURRENT" }

/**
 * Step 2 (ACCOUNT_SETUP only) — Select bank + account type.
 *
 * Zero-Manual Rule:
 *   This DTO MUST NOT and DOES NOT contain Name, DOB, Address, or any demographic field.
 *   Those values are pulled exclusively from the NIBSS shadow profile (the Absolute Source of Truth).
 *   The server will reject any request that attempts to supply identity data in this DTO.
 *
 * After receiving this DTO:
 *   1. Server decrypts shadowProfileBlob from BiometricScanSession.
 *   2. Calls BankDirectoryService.pushToCbs() with the NIBSS identity — zero user-supplied fields.
 *   3. Bank CBS returns account number within 60 seconds.
 */
export class SelectBankProvisionDto {
  @ApiProperty({
    description: "CBN/BoG sort code from the National Bank Directory",
    example: "011151012",
  })
  @IsString()
  @Length(6, 12)
  bankCode!: string;

  @ApiProperty({ enum: BihAccountType, example: BihAccountType.SAVINGS })
  @IsEnum(BihAccountType)
  accountType!: BihAccountType;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

