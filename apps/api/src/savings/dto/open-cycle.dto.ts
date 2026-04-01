import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class OpenCycleDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ description: "Agent BVN (11 digits)", example: "98765432109" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @ApiProperty({
    description: "Day-1 First Payment total in minor units (e.g. kobo for NGN). " +
      "60% of this becomes the Agent Liquidity stake that seeds daily incentives.",
    example: 500000,
  })
  @IsNumber()
  @IsPositive()
  day1TotalFeeMinor!: number;

  @ApiProperty({
    description: "Expected daily deposit amount (Day 2–31) in minor units.",
    example: 100000,
  })
  @IsNumber()
  @IsPositive()
  dailyDepositMinor!: number;

  @ApiPropertyOptional({ example: "NGN" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currencyCode?: string;

  @ApiProperty({ description: "Partner bank handling the cycle", example: "UBA" })
  @IsString()
  @IsNotEmpty()
  partnerBank!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

