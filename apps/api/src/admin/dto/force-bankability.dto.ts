import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

/**
 * Admin-forced bankability upgrade DTO.
 * Used when the NIBSS callback was missed (network drop, webhook failure, etc.)
 * and the operator needs to manually complete the UNBANKED → BANKABLE transition.
 */
export class ForceBankabilityDto {
  /** The BVN that NIBSS issued — used to create the TfanRecord mirror and LedgerAccount. */
  @IsString()
  @Matches(/^[0-9]{11}$/)
  bvn!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  orgId?: string;
}

