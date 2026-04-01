import {
  IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, Min, ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

/**
 * BEPWG Withdrawal Request — The Biometric Mandate + 10m Rule.
 *
 * Standard Path (1/3 gate):
 *   Requires: mature cycle + within 10m of anchor + trusted agent + 1 biometric YES.
 *
 * Bypass Path (2/3 gate):
 *   Any condition unmet → 2 biometric gates required.
 *   Incomplete cycle still incurs 50% Liquidation Penalty.
 *
 * At least ONE of fingerprintTemplateB64 | faceTemplateB64 | mobileNumber must be provided.
 */
export class BepwgWithdrawDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ description: "Agent BVN (11 digits)", example: "98765432109" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @ApiProperty({ description: "Savings cycle reference", example: "CYC-A1B2C3D4E5F6" })
  @IsString()
  @IsNotEmpty()
  cycleRef!: string;

  @ApiProperty({ description: "Current GPS latitude (WGS-84)", example: 6.5244 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  gpsLatitude!: number;

  @ApiProperty({ description: "Current GPS longitude (WGS-84)", example: 3.3792 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  gpsLongitude!: number;

  @ApiPropertyOptional({ description: "Gate 2: Base64 fingerprint template (minutiae string)" })
  @IsOptional()
  @IsString()
  fingerprintTemplateB64?: string;

  @ApiPropertyOptional({ description: "Gate 1: Base64 HD face map" })
  @IsOptional()
  @IsString()
  faceTemplateB64?: string;

  @ApiPropertyOptional({
    description: "Gate 3: BVN/TFAN-linked mobile number for push/OTP verification",
    example: "+2348012345678",
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber?: string;

  @ApiPropertyOptional({
    description:
      "Set true when POS has no network. Server validates the offlineCacheToken " +
      "instead of performing real-time NIBSS calls and server-side proximity check.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({
    description:
      "HMAC-signed offline cache token issued by GET /v1/bepwg/location/:hash/offline-cache. " +
      "Required when isOffline = true.",
  })
  @ValidateIf((o) => o.isOffline === true)
  @IsString()
  @IsNotEmpty()
  offlineCacheToken?: string;

  @ApiProperty({ description: "Destination bank account number or mobile wallet ID" })
  @IsString()
  @IsNotEmpty()
  destinationAccountRef!: string;

  @ApiPropertyOptional({ example: "UBA" })
  @IsOptional()
  @IsString()
  destinationBank?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

