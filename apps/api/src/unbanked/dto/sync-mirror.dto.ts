import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

/**
 * Watch Eye Mirror Sync DTO.
 * Sent after any NIBSS YES to intercept and mirror the verified biometric gate(s)
 * into the internal Watch Eye supplemental log.
 * At least one of fingerprintTemplateB64 | faceTemplateB64 | mobileNumber is required.
 */
export class SyncMirrorDto {
  /** BVN of the verified user — must already be enrolled (TfanRecord must exist). */
  @IsString()
  @Matches(/^[0-9]{11}$/)
  bvn!: string;

  /** Fingerprint template (base64, ISO-19794-2) from the NIBSS YES response. */
  @IsOptional()
  @IsString()
  fingerprintTemplateB64?: string;

  /** Face template (base64) from the NIBSS YES response. */
  @IsOptional()
  @IsString()
  faceTemplateB64?: string;

  /** Mobile number verified via ICAD / push channel. */
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber?: string;

  /** NIBSS correlation ID from the YES response — stored in the supplemental log for audit. */
  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}

