import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * POS-initiated Networkless Challenge-Response session.
 *
 * Triggers:
 *   1. An encrypted push notification / USSD-style overlay on the customer's phone.
 *   2. A cognitive challenge (image selection or transaction-linked number).
 *   3. A 6-digit TOTP code displayed on the POS terminal screen.
 *
 * Two-step approval:
 *   Step A — customer clicks YES + submits cognitive challenge answer on their phone.
 *   Step B — customer reads TOTP from POS screen and enters it on their phone.
 *
 * Both steps must succeed within the 120-second session TTL.
 */
export class InitiateNetworklessDto {
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

  @ApiProperty({
    description: "POS / terminal ID initiating the withdrawal (from TCP terminal binding)",
    example: "TERM-001",
  })
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

