import { IsNumber, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

/**
 * Register (or update) a customer's Location Anchor — the static GPS reference
 * point used by the NIBSS 10-Meter Rule for proximity-gated withdrawals.
 *
 * Captured at account creation and stored alongside the NIBSS/TFAN profile.
 * Updates generate a fresh AES-256-GCM offline cache blob for POS devices.
 */
export class RegisterLocationDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({
    description: "Latitude in decimal degrees (WGS-84, ±90). Precision to 7 dp (≈ 1 cm).",
    example: 6.5244,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitudeDeg!: number;

  @ApiProperty({
    description: "Longitude in decimal degrees (WGS-84, ±180). Precision to 7 dp (≈ 1 cm).",
    example: 3.3792,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitudeDeg!: number;

  @ApiPropertyOptional({ description: "TFAN ID (for unbanked profiles not yet assigned a BVN)" })
  @IsOptional()
  @IsString()
  tfanId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

