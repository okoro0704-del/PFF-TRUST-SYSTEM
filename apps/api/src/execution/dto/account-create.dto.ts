import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { TripleGateEnrollDto } from "../../verification/dto/enroll.dto";

export class AccountCreateDto {
  @IsString()
  @IsIn(["bvn", "internal"])
  mode!: "bvn" | "internal";

  @IsOptional()
  @IsString()
  currencyCode?: string;

  @IsOptional()
  @IsString()
  initialDepositMinor?: string;

  @IsOptional()
  @IsString()
  orgId?: string;

  /** When mode=bvn — full NIBSS enrollment + TFAN (reuses verification DTO shape). */
  @ValidateNested()
  @Type(() => BvnEnrollmentPayload)
  @IsOptional()
  bvnEnrollment?: BvnEnrollmentPayload;

  /** When mode=internal — 10 fingerprints + face + mobile (no PIN/password). */
  @ValidateNested()
  @Type(() => InternalEnrollmentPayload)
  @IsOptional()
  internalEnrollment?: InternalEnrollmentPayload;
}

export class BvnEnrollmentPayload extends TripleGateEnrollDto {}

export class InternalEnrollmentPayload {
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fingerprintsTemplateB64!: string[];

  @IsString()
  @IsNotEmpty()
  faceTemplateB64!: string;

  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber!: string;
}
