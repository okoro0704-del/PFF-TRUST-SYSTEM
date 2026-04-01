import { IsNotEmpty, IsString } from "class-validator";

export class LiquidityIngestDto {
  @IsString()
  @IsNotEmpty()
  partnerBank!: string;

  @IsString()
  @IsNotEmpty()
  accountRef!: string;

  @IsString()
  @IsNotEmpty()
  balanceMinor!: string;

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;
}
