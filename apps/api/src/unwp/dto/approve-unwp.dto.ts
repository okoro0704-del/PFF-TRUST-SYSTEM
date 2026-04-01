import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step-A: Customer clicks YES and answers the cognitive challenge on their phone.
 *
 * The server:
 *   1. Validates cognitiveAnswer against the stored HMAC.
 *   2. Advances session → APPROVED_STEP_A.
 *   3. Returns the current 6-digit POS display code (phone now prompts user to type it).
 */
export class StepAApproveUnwpDto {
  @ApiProperty({
    description: "Customer's answer to the cognitive challenge task",
    example: "1250",
  })
  @IsString()
  @MaxLength(32)
  cognitiveAnswer!: string;

  @ApiPropertyOptional({ description: "Phone device ID for audit", example: "DEV-SAMSUNG-XYZ" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

/**
 * Step-B: Customer enters the 6-digit POS display code on their phone.
 *
 * The server:
 *   1. Validates the TOTP code (RFC 6238, ±1 step skew tolerance).
 *   2. Advances session → COMPLETED.
 *   3. Returns authorization signal for POS to release funds.
 */
export class StepBConfirmUnwpDto {
  @ApiProperty({
    description: "6-digit code from POS terminal screen",
    example: "482910",
  })
  @IsString()
  @MaxLength(6)
  posCode!: string;

  @ApiPropertyOptional({ description: "Phone device ID for audit", example: "DEV-SAMSUNG-XYZ" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

