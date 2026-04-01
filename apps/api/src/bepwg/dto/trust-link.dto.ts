import { IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Establish a Trusted Agent Link between a customer and an agent.
 * The link is automatically incremented when a withdrawal is executed
 * through a given agent. This DTO allows manual seeding (e.g., at cycle open).
 */
export class TrustLinkDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({ description: "Agent BVN (11 digits)", example: "98765432109" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

