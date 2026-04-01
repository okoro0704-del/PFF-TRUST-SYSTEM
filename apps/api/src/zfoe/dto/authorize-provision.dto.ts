import { IsEnum, IsOptional, IsString, MaxLength, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum BiometricGate { FACE = "FACE", FINGERPRINT = "FINGERPRINT" }

/**
 * Step 3 — Customer authorizes via biometric, triggering the 60-second account minting mandate.
 *
 * Flow:
 *   1. Biometric template forwarded to NIBSS LBAS gate (Face or FAP-20 Fingerprint).
 *   2. On MatchFound → session BIOMETRIC_OK → PROVISIONING.
 *   3. CBS API push: bank receives identity package, issues account number.
 *   4. SMS/Push dispatched to MSISDN within the 60-second window.
 *   5. elapsedMs logged in ZfoeAuditLog (account_gen_timestamp = now).
 */
export class AuthorizeProvisionDto {
  @ApiProperty({
    description: "Customer BVN — used to look up NIBSS biometric template",
    example: "12345678901",
  })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ enum: BiometricGate, description: "Biometric verification gate", example: BiometricGate.FACE })
  @IsEnum(BiometricGate)
  gate!: BiometricGate;

  @ApiProperty({
    description:
      "Base64-encoded biometric template — face frame (JPEG/PNG) or FAP-20 minutiae (ISO 19794-2 / WSQ)",
    example: "/9j/4AAQ...",
  })
  @IsString()
  biometricTemplateB64!: string;

  @ApiPropertyOptional({
    description: "FAP-20 device ID (fingerprint path only)",
    example: "DEV-ARATEK-A600-001",
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sensorDeviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

