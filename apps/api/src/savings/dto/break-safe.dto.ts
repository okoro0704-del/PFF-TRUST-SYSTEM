import { IsNotEmpty, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional } from "class-validator";

/**
 * Emergency Break ("Break Safe") — Condition 3 of the Tri-Condition Withdrawal Gate.
 *
 * Applying a 50% penalty on totalSavedToDate. The penalty is routed to the
 * System Account. A unique Penalty_Event_ID is stamped for audit/reconciliation.
 *
 * ⚠  This action is IRREVERSIBLE. The customer must supply a valid biometric
 *    validation hash (the "Yes" Call Handshake) to execute.
 */
export class BreakSafeDto {
  @ApiProperty({ description: "Customer BVN (11 digits)", example: "12345678901" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  customerBvn!: string;

  @ApiProperty({
    description:
      "Biometric validation hash minted by POST /execution/mint-validation-hash. " +
      "Required — confirms the customer's identity before the penalty is applied.",
  })
  @IsString()
  @IsNotEmpty()
  biometricValidationHash!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

