import { IsEnum, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum EscalationGate {
  FACE        = "FACE",
  FINGERPRINT = "FINGERPRINT",
}

/**
 * Trigger biometric escalation — called by POS when the phone push fails.
 *
 * Transitions session → BIOMETRIC_ESCALATION.
 * Returns: { sessionRef, status, message } — POS now prompts for biometric scan.
 */
export class EscalateUnwpDto {
  @ApiProperty({
    description: "Reason the push/challenge failed",
    example: "Phone battery dead — customer present at counter",
  })
  @IsString()
  @MaxLength(256)
  escalationReason!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

/**
 * Submit biometric proof during escalation — requires a NIBSS network heartbeat.
 *
 * The POS must have a minimal network signal to forward biometrics to NIBSS.
 * Requires at least 1 gate match (Face OR Fingerprint).
 * On success → session COMPLETED; POS releases funds.
 */
export class SubmitEscalationBiometricDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ enum: EscalationGate, description: "Which biometric gate to use" })
  @IsEnum(EscalationGate)
  gate!: EscalationGate;

  @ApiProperty({
    description:
      "Base64-encoded biometric template — face frame (JPEG/PNG) or FAP-20 minutiae (ISO 19794-2 / WSQ)",
    example: "/9j/4AAQ...",
  })
  @IsString()
  biometricTemplateB64!: string;

  @ApiPropertyOptional({ description: "FAP-20 device ID (fingerprint only)", example: "DEV-SECUGEN-001" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sensorDeviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

