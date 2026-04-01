import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Step A — customer clicks YES and submits cognitive challenge answer on their phone. */
export class StepAApproveDto {
  @ApiProperty({
    description:
      "Answer to the cognitive challenge displayed on the phone " +
      "(option ID for image-selection tasks, or the prompted number for number-input tasks).",
    example: "house",
  })
  @IsString()
  @IsNotEmpty()
  cognitiveAnswer!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

/**
 * Step B — customer reads the 6-digit TOTP code from the POS terminal screen
 * and enters it on their phone to complete the two-step approval.
 */
export class StepBConfirmDto {
  @ApiProperty({
    description:
      "6-digit TOTP code displayed on the POS terminal screen. " +
      "Valid for 30 seconds ± 1 step (clock skew tolerance).",
    example: "483920",
  })
  @IsString()
  @IsNotEmpty()
  posCode!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

