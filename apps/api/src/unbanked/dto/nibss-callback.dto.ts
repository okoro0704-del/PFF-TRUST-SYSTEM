import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * NIBSS Feedback Loop DTO — received via webhook from the NIBSS Enrollment API
 * or the 2026 Sovereign Identity Gateway after BVN generation completes.
 */
export class NibssCallbackDto {
  /** Our enrollment reference sent in the original push payload. */
  @IsString()
  @IsNotEmpty()
  enrollmentId!: string;

  /** SUCCESS = BVN minted; DUPLICATE = existing BVN found; ERROR = submission rejected. */
  @IsIn(["SUCCESS", "DUPLICATE", "ERROR"])
  status!: "SUCCESS" | "DUPLICATE" | "ERROR";

  /** Set by NIBSS on SUCCESS — the newly minted BVN. */
  @IsOptional()
  @IsString()
  assignedBvn?: string;

  /** Set by NIBSS on DUPLICATE — the existing BVN to link via Mirror Protocol. */
  @IsOptional()
  @IsString()
  existingBvn?: string;

  /** Full raw response body forwarded from NIBSS for the audit trail. */
  @IsOptional()
  @IsString()
  rawPayload?: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}

