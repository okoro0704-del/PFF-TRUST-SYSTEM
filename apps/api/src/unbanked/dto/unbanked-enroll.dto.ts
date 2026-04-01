import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

/** Full-Spectrum Enrollment DTO — captures biometrics + demographics for unbanked users (no BVN). */
export class UnbankedEnrollDto {
  // ── Biometrics ──────────────────────────────────────────────────────────────
  /** Exactly 10 fingerprint templates (base64, ISO-19794-2 format). */
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fingerprintsTemplateB64!: string[];

  /** High-definition face map — base64 encoded. Passive liveness enforced. */
  @IsString()
  @IsNotEmpty()
  faceTemplateB64!: string;

  /** MSISDN — used as third biometric gate (ICAD / push channel). */
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber!: string;

  // ── Demographics (NIBSS-required fields) ────────────────────────────────────
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  /** ISO 8601 date — YYYY-MM-DD. */
  @IsDateString()
  dateOfBirth!: string;

  @IsIn(["M", "F"])
  gender!: "M" | "F";

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  stateOfOrigin!: string;

  // ── Regional Compliance ──────────────────────────────────────────────────────
  /** ISO country code — data processed in home country before NIBSS push. */
  @IsOptional()
  @IsIn(["NG", "GH"])
  shardCountry?: "NG" | "GH";

  @IsOptional()
  @IsString()
  orgId?: string;
}

