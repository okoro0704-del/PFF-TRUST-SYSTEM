import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 1 — Submit the raw fingerprint template captured by the FAP-20 / mobile sensor.
 *
 * Security model:
 *   - The raw template arrives at our server over TLS 1.3 (never persisted).
 *   - The server immediately encrypts it with AES-256-GCM (BIH_TEMPLATE_KEY)
 *     before forwarding to the NIBSS Biometric Gateway (1:N national registry search).
 *   - Only the SHA-256 hash of the encrypted template is stored in BiometricScanSession
 *     (for tamper-audit purposes).
 *   - The encrypted template is purged the instant the NIBSS response is received;
 *     `templatePurgedAt` is written to the audit log.
 *
 * Format: ISO 19794-2 WSQ minutiae (FAP-20 standard) — base64-encoded raw bytes.
 */
export class SubmitTemplateDto {
  @ApiProperty({
    description:
      "Base64-encoded raw fingerprint minutiae from the FAP-20 sensor (ISO 19794-2 / WSQ). " +
      "MUST be sent over TLS 1.3. Server encrypts AES-256-GCM before NIBSS transit. " +
      "Template is NEVER stored — only its SHA-256 hash is retained for audit.",
    example: "/9j/4AAQ...",
  })
  @IsString()
  rawTemplateB64!: string;

  @ApiPropertyOptional({
    description: "FAP-20 sensor device ID — logged in audit trail for hardware accountability",
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

