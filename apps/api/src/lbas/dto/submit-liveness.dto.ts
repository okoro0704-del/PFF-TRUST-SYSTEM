import {
  ArrayMinSize, IsArray, IsNotEmpty, IsNumber, IsObject,
  IsOptional, IsString, Max, Min, ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

/**
 * Per-task optical-flow proof submitted by the client.
 * Validated server-side against minimum liveness / depth thresholds.
 */
export class TaskProofDto {
  @ApiProperty({ description: "Task code matching the issued challenge (e.g. 'BLINK_TWICE')" })
  @IsString()
  @IsNotEmpty()
  taskCode!: string;

  @ApiProperty({ description: "Combined liveness confidence score (0–1)", example: 0.93 })
  @IsNumber()
  @Min(0)
  @Max(1)
  livenessScore!: number;

  @ApiProperty({ description: "Depth-variance score detecting 3-D face vs flat photo (0–1)", example: 0.85 })
  @IsNumber()
  @Min(0)
  @Max(1)
  depthVarianceScore!: number;

  @ApiProperty({ description: "Number of frames captured during task (must be ≥ 8)", example: 14 })
  @IsNumber()
  @Min(1)
  frameCount!: number;

  @ApiPropertyOptional({
    description: "Facial landmark confidence per task (JSON-serialisable object)",
    example: { leftEye: 0.97, rightEye: 0.96 },
  })
  @IsOptional()
  @IsObject()
  landmarkConfidence?: Record<string, number>;
}

/**
 * Submit optical-flow proof for each issued liveness task.
 * Includes the HD face template for NIBSS matching after all proofs pass.
 */
export class SubmitLivenessDto {
  @ApiProperty({ description: "Session token returned by POST /lbas/liveness/challenge" })
  @IsString()
  @IsNotEmpty()
  sessionToken!: string;

  @ApiProperty({ type: [TaskProofDto], description: "One proof object per issued task" })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaskProofDto)
  taskProofs!: TaskProofDto[];

  @ApiProperty({ description: "Base64-encoded HD face template for NIBSS Face Match (final step)" })
  @IsString()
  @IsNotEmpty()
  faceTemplateB64!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

