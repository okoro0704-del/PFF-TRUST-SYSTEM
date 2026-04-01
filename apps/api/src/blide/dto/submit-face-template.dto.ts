import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum FaceTemplateFormat {
  ISO19794_5 = "ISO19794_5",  // ISO/IEC 19794-5 ICAO-compliant face image
  JPEG       = "JPEG",        // Raw JPEG frame from POS/mobile camera
  HEIF       = "HEIF",        // Apple HEIF — mobile capture
}

/**
 * Step 1 — Submit the raw face frame captured by POS camera or mobile selfie camera.
 *
 * Security model:
 *   - Raw frame arrives at server over TLS 1.3, NEVER persisted.
 *   - Server encrypts AES-256-GCM (BLIDE_FACE_KEY) before NIBSS 1:N face search transit.
 *   - NIBSS performs 1:N search across national BVN face registry (ISO 19794-5).
 *   - SHA-256 hash of encrypted template stored; raw frame purged immediately post-match.
 *   - faceTemplatePurgedAt stamped in BlideSession for compliance audit.
 *
 * On MatchFound:
 *   - ACCOUNT_SETUP: NibssIdentityPackage (Name, DOB, Address, etc.) built + AES-256-GCM stored.
 *   - Financial: DiscoveredAccount[] built, sorted desc by balance, AES-256-GCM stored.
 *   - Client receives identity preview (read-only, Account Setup) or masked account cards.
 *
 * Liveness note: this is the Primary Discovery Scan only — the Liveness Challenge
 * (Blink/Smile/etc.) is issued separately in Step 3 after target selection.
 */
export class SubmitFaceTemplateDto {
  @ApiProperty({
    description:
      "Base64-encoded raw face frame (ISO 19794-5 / JPEG / HEIF from POS or mobile camera). " +
      "Encrypted AES-256-GCM server-side before NIBSS transit. Frame NEVER stored.",
    example: "/9j/4AAQ...",
  })
  @IsString()
  rawFaceTemplateB64!: string;

  @ApiProperty({ enum: FaceTemplateFormat, example: FaceTemplateFormat.JPEG })
  @IsEnum(FaceTemplateFormat)
  faceFormat!: FaceTemplateFormat;

  @ApiPropertyOptional({ description: "Camera device ID for audit trail", example: "CAM-NEXGO-N86-001" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cameraDeviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

