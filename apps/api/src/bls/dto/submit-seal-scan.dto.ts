import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 3 — Seal Scan: the mandatory Second Fingerprint to prevent ghost transactions.
 *
 * Security model:
 *   - Raw template encrypted AES-256-GCM (BLS_TEMPLATE_KEY) before NIBSS 1:N transit.
 *   - NIBSS returns a new Final_Authorization_Scan_ID (sealScanId — DISTINCT from discoveryScanId).
 *   - Server derives sealBvnHash and verifies: bvnAnchorHash === sealBvnHash.
 *     This cross-validates that BOTH scans were performed by the same individual.
 *   - On success: withdrawal executed, accountMapBlob zeroed, templateDataPurgedAt stamped.
 *   - Audit log records: Discovery_Scan_ID + Selected_Bank_Code + Final_Authorization_Scan_ID.
 *   - Session token invalidated immediately after execution.
 *
 * Ghost-transaction prevention:
 *   - sealScanId MUST differ from discoveryScanId (two distinct NIBSS events).
 *   - The 60-second idle timer must still be valid at the time of submission.
 */
export class SubmitSealScanDto {
  @ApiProperty({
    description: "Base64-encoded raw FAP-20 minutiae — the Final Authorization Scan. Same format as Discovery Scan.",
    example: "/9j/4AAQ...",
  })
  @IsString()
  rawTemplateB64!: string;

  @ApiPropertyOptional({ description: "FAP-20 device ID", example: "DEV-ARATEK-A600-001" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sensorDeviceId?: string;

  @ApiProperty({ description: "Opaque session token", example: "eyJ..." })
  @IsString()
  sessionToken!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

