import { IsInt, IsPositive, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

/**
 * Step 2 — Account selection + withdrawal amount input.
 *
 * The user selects one of the accounts from the discovery map (by masked ref)
 * and enters the withdrawal amount. The session advances to AWAITING_SEAL.
 * The 60-second idle timer is reset on this call.
 *
 * selectedAccountRef must exactly match a masked ref from the discovery response
 * (e.g. "****1234"). The server validates against the encrypted account map blob.
 */
export class SelectAccountDto {
  @ApiProperty({
    description: "Masked account reference from the discovery map (e.g. '****1234')",
    example: "****7890",
  })
  @IsString()
  @MaxLength(16)
  selectedAccountRef!: string;

  @ApiProperty({
    description: "Withdrawal amount in minor units (kobo). Must not exceed discovered balance.",
    example: 250000,
  })
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiProperty({ description: "Opaque session token", example: "eyJ..." })
  @IsString()
  sessionToken!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

