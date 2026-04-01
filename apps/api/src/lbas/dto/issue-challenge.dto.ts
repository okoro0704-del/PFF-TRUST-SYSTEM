import { IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Issue a randomised liveness challenge.
 * Returns a session token + randomised task sequence (e.g. ["BLINK_TWICE","HEAD_TURN_LEFT"]).
 * Client must complete the task sequence and submit optical-flow proof within 90 seconds.
 */
export class IssueChallengeDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

