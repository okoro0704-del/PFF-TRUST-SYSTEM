import { IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * Non-biometric profile update DTO.
 *
 * Only editable fields are allowed — biometric data (fingerprints, face, mobile)
 * and identity-critical fields (gender, dateOfBirth) remain permanently immutable.
 * May only be called when profile status is NOT "NIBSS_SUBMITTED".
 */
export class ProfileEditDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  /** May be set to empty string to clear middle name. */
  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  stateOfOrigin?: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}

