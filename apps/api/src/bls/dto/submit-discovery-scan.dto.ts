import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 1 — Discovery Scan: submit FAP-20 fingerprint minutiae.
 *
 * Security model (identical to BIH template submission):
 *   - Raw template arrives at server over TLS 1.3, NEVER persisted.
 *   - Server encrypts AES-256-GCM (BLS_TEMPLATE_KEY) before NIBSS 1:N transit.
 *   - NIBSS searches entire national BVN registry and returns:
 *       a) NIBSS_Match_ID  (Discovery_Scan_ID)
 *       b) Linked account list with real-time balances (Account Mapping Feed)
 *   - SHA-256 hash of encrypted template is stored; raw template purged immediately.
 *   - bvnAnchorHash derived from resolved identity for Seal cross-validation.
 *
 * On match, the session advances to DISCOVERED and the client receives
 * a masked account list (no full account numbers exposed in transit).
 */
export class SubmitDiscoveryScanDto {
  @ApiProperty({
    description: "Base64-encoded raw FAP-20 minutiae (ISO 19794-2 WSQ). Encrypted AES-256-GCM server-side before NIBSS.",
    example: "/9j/4AAQ...",
  })
  @IsString()
  rawTemplateB64!: string;

  @ApiPropertyOptional({ description: "FAP-20 device ID — logged in audit trail", example: "DEV-ARATEK-A600-001" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sensorDeviceId?: string;

  @ApiProperty({ description: "Opaque session token from POST /v1/bls/initiate", example: "eyJ..." })
  @IsString()
  sessionToken!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

