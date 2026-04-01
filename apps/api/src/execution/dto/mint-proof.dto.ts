import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { BiometricInlineDto } from "./biometric-inline.dto";

/** Mint a short-lived validation hash after a successful yes call. */
export class MintProofDto {
  @IsString()
  @IsNotEmpty()
  accountPublicRef!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{11}$/)
  bvn?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  online?: boolean;

  @ValidateNested()
  @Type(() => BiometricInlineDto)
  @IsOptional()
  biometrics?: BiometricInlineDto;
}
