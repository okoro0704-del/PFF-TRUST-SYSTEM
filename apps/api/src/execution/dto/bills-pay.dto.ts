import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { BiometricInlineDto } from "./biometric-inline.dto";

export class BillsPayDto {
  @IsString()
  @IsNotEmpty()
  accountPublicRef!: string;

  @IsString()
  @IsNotEmpty()
  amountMinorUnits!: string;

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsString()
  @IsNotEmpty()
  utilityCode!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  biometricValidationHash?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{11}$/)
  bvn?: string;

  @ValidateNested()
  @Type(() => BiometricInlineDto)
  @IsOptional()
  biometrics?: BiometricInlineDto;

  @IsOptional()
  @IsString()
  orgId?: string;

  /** Offline utility pay — provisional until Pulse sync */
  @IsOptional()
  @IsBoolean()
  offlineProvision?: boolean;
}
