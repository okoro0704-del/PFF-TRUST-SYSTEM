import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Execute Vault Withdrawal — only callable when withdrawalGateStatus ≠ LOCKED.
 *
 * Gate conditions (any one must be TRUE, evaluated server-side):
 *   1. Full Cycle  — daysSaved == 31
 *   2. Month-End   — today is the last calendar day of the month
 *   3. Emergency   — customer previously called POST /break-safe
 *
 * The "Yes" Call Handshake (biometricValidationHash) is mandatory before
 * funds are pushed to the destination account.
 */
export class WithdrawVaultDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({
    description:
      "Biometric validation hash (90-second TTL) minted by POST /execution/mint-validation-hash. " +
      "The 'Yes Call Handshake' — mandatory before funds are pushed.",
  })
  @IsString()
  @IsNotEmpty()
  biometricValidationHash!: string;

  @ApiProperty({
    description: "Destination account reference (bank account number or mobile wallet ID).",
    example: "0123456789",
  })
  @IsString()
  @IsNotEmpty()
  destinationAccountRef!: string;

  @ApiPropertyOptional({ description: "Destination bank code or name", example: "UBA" })
  @IsOptional()
  @IsString()
  destinationBank?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

