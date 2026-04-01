import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  CASD_APPROVED, CASD_PENDING_REVIEW,
  CASD_REJECTED, CASD_VERIFICATION_IN_PROGRESS,
} from "../casd.constants";

export enum BankStatusEnum {
  PENDING_REVIEW           = CASD_PENDING_REVIEW,
  VERIFICATION_IN_PROGRESS = CASD_VERIFICATION_IN_PROGRESS,
  APPROVED                 = CASD_APPROVED,
  REJECTED                 = CASD_REJECTED,
}

/**
 * Admin DTO — update the status of a bank application.
 *
 * Advance flow:  PENDING_REVIEW → VERIFICATION_IN_PROGRESS → APPROVED
 * Reject:        Any status → REJECTED (requires reviewerNotes).
 *
 * When status reaches APPROVED, the Push-to-Bank trigger fires automatically,
 * sending all active SovereignDocuments to the bank's contact email.
 */
export class UpdateBankStatusDto {
  @ApiProperty({
    enum: BankStatusEnum,
    description:
      "Target status. Use ADVANCE to cycle forward: PENDING→VERIFICATION→APPROVED. " +
      "Set REJECTED to reject at any stage (reviewerNotes required).",
    example: BankStatusEnum.VERIFICATION_IN_PROGRESS,
  })
  @IsEnum(BankStatusEnum)
  status!: BankStatusEnum;

  @ApiPropertyOptional({
    description: "Internal notes from the reviewer. Required when rejecting.",
    example: "CAC document failed hash verification — please re-upload.",
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  reviewerNotes?: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

