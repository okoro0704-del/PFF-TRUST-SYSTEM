import { IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class DailyDepositDto {
  @ApiProperty({
    description: "Deposit amount in minor units (must match the dailyDepositMinor on the cycle).",
    example: 100000,
  })
  @IsNumber()
  @IsPositive()
  amountMinor!: number;

  @ApiPropertyOptional({
    description:
      "Biometric validation hash minted by POST /execution/mint-validation-hash (90-second TTL). " +
      "Required for Day-31 (final day) deposits to enable immediate gate evaluation.",
  })
  @IsOptional()
  @IsString()
  biometricValidationHash?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

