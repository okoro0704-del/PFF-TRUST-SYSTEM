import { Type } from "class-transformer";
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { BiometricInlineDto } from "./biometric-inline.dto";

export class WithdrawAuthorizeDto {
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
  @IsIn(["POS", "ATM"])
  channel!: "POS" | "ATM";

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
}
