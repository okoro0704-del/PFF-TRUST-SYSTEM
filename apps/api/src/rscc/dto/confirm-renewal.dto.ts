import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Admin DTO — confirm license renewal for a bank.
 *
 * Renewal flow:
 *   1. Bank deposits ₦500,000 into their dedicated account.
 *   2. Admin verifies deposit in banking system.
 *   3. Admin calls PATCH /v1/rscc/licenses/:id/renew with this DTO.
 *   4. Server: extends licenseEndDate + 31 days from now, lifts apiAccessRestricted,
 *      sets status → ACTIVE, stamps renewalConfirmedAt + renewalConfirmedBy.
 *   5. Any LICENSE_EXPIRING red flags for this bank are auto-resolved.
 */
export class ConfirmRenewalDto {
  @ApiPropertyOptional({
    description: "Admin email or ID confirming the renewal. Stamped in renewalConfirmedBy for audit.",
    example: "admin@fman.ng",
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  confirmedBy?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

