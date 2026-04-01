import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Submit an external FAP-20 fingerprint template to the NIBSS gate.
 *
 * The mobile app / POS intercepts the raw minutiae from the external sensor,
 * encodes it as ISO/IEC 19794-2 or WSQ, base64-encodes it, and sends it here.
 * The server forwards to the NIBSS biometric gate for matching.
 *
 * Transport is TLS 1.3. The server never persists raw biometric templates.
 */
export class SubmitFingerprintDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({
    description:
      "Hardware serial number of the registered FAP-20 sensor that captured this print.",
    example: "DRM-LF10-8A3F2B91",
  })
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({
    description:
      "Base64-encoded fingerprint minutiae template in ISO/IEC 19794-2 or WSQ format. " +
      "Captured by the external FAP-20 sensor. Transport-encrypted by TLS 1.3.",
  })
  @IsString()
  @IsNotEmpty()
  fingerprintTemplateB64!: string;

  @ApiProperty({
    enum: ["ISO_19794_2", "WSQ", "ANSI_INCITS_378"],
    description: "Minutiae template format",
    example: "ISO_19794_2",
  })
  @IsIn(["ISO_19794_2", "WSQ", "ANSI_INCITS_378"])
  templateFormat!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

