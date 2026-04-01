import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

/** Base64-encoded biometric template or UTF-8 for mobile */
export class TripleGateEnrollDto {
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

  @IsOptional()
  @IsString()
  orgId?: string;
}
