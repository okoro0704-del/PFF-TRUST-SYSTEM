import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Commit a completed UNWP transaction to the offline POS ledger.
 *
 * Called by the POS immediately after the TOTP step-B (or biometric escalation) succeeds,
 * regardless of whether the POS has network connectivity at that moment.
 *
 * The server:
 *   1. Derives amountMinor, customerBvnHash from the session (prevents tampering).
 *   2. Builds the full transaction payload.
 *   3. Encrypts with AES-256-GCM (POS terminal key).
 *   4. Computes SHA-256 checksum.
 *   5. Stores in PosOfflineLedger (QUEUED).
 *
 * When connectivity is restored, call POST /v1/unwp/ledger/reconcile to submit to NIBSS.
 */
export class CommitLedgerDto {
  @ApiProperty({ description: "UNWP session reference", example: "unwp_ref_abc123" })
  @IsString()
  sessionRef!: string;

  @ApiProperty({
    description: "Phone hardware device ID — mandatory for audit trail",
    example: "DEV-SAMSUNG-XYZ",
  })
  @IsString()
  @MaxLength(128)
  deviceId!: string;

  @ApiProperty({
    description: "ISO 8601 timestamp of when the user approved on their phone",
    example: "2026-03-30T14:35:00.000Z",
  })
  @IsDateString()
  approvalTimestamp!: string;

  @ApiProperty({
    description: "Cognitive task ID that the customer completed",
    example: "CONFIRM_AMOUNT",
  })
  @IsString()
  @MaxLength(64)
  taskId!: string;

  @ApiProperty({
    description: "True if biometric escalation (face/fingerprint) was used instead of push+TOTP",
    example: false,
  })
  @IsBoolean()
  biometricFallback!: boolean;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

/**
 * Reconcile all QUEUED ledger entries for a terminal — called when the POS regains connectivity.
 *
 * The server decrypts each entry, validates the SHA-256 checksum, and submits to NIBSS.
 * Double-spend protection: unique TLI constraint at the DB level rejects any duplicate.
 */
export class ReconcileLedgerDto {
  @ApiProperty({ description: "POS terminal hardware ID", example: "POS-ABUJA-0042" })
  @IsString()
  @MaxLength(64)
  terminalId!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

