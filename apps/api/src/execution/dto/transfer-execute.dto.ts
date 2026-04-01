import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { BiometricInlineDto } from "./biometric-inline.dto";

export class TransferExecuteDto {
  @IsString()
  @IsNotEmpty()
  debitPublicRef!: string;

  @IsString()
  @IsNotEmpty()
  creditPublicRef!: string;

  @IsString()
  @IsNotEmpty()
  amountMinorUnits!: string;

  @IsString()
  @IsNotEmpty()
  currencyCode!: string;

  @IsOptional()
  @IsString()
  narrative?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /** Pulse Sync: offline provisional — settles on Sovryn when device syncs. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  offlineProvision?: boolean;

  /** Required when EXECUTION_REQUIRE_HASH_ONLY=true (default). Mint via POST /execution/mint-validation-hash */
  @IsOptional()
  @IsString()
  biometricValidationHash?: string;

  /** Required for online BVN NIBSS path when not using validation hash. */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{11}$/)
  bvn?: string;

  @ValidateNested()
  @Type(() => BiometricInlineDto)
  @IsOptional()
  biometrics?: BiometricInlineDto;
}
