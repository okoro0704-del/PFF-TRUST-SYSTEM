import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class TransactionConfirmDto {
  @IsString()
  @IsNotEmpty()
  bvn!: string;

  @IsString()
  @IsNotEmpty()
  fingerprintTemplateB64!: string;

  @IsString()
  @IsNotEmpty()
  faceTemplateB64!: string;

  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber!: string;

  @IsString()
  @IsNotEmpty()
  amountMinorUnits!: string;

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
