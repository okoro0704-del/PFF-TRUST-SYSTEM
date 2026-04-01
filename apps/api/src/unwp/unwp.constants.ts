// ─── UNWP Session Status ──────────────────────────────────────────────────────
/** POS has submitted transaction; awaiting phone push delivery */
export const UNWP_INITIATED            = "INITIATED";
/** Customer tapped YES + answered cognitive task on phone */
export const UNWP_APPROVED_STEP_A      = "APPROVED_STEP_A";
/** Customer confirmed 6-digit POS code — funds authorized */
export const UNWP_COMPLETED            = "COMPLETED";
/** Push failed / phone unavailable → biometric escalation path active */
export const UNWP_BIOMETRIC_ESCALATION = "BIOMETRIC_ESCALATION";
/** Rejected by cognitive/TOTP mismatch or max-retry exceeded */
export const UNWP_REJECTED             = "REJECTED";
/** 5-minute session window elapsed without completion */
export const UNWP_EXPIRED              = "EXPIRED";

// ─── Offline Ledger Status ────────────────────────────────────────────────────
/** Transaction recorded locally; pending network restoration */
export const LEDGER_QUEUED      = "QUEUED";
/** Submitted to NIBSS reconciliation endpoint */
export const LEDGER_SUBMITTED   = "SUBMITTED";
/** Confirmed by NIBSS; debit posted to account */
export const LEDGER_RECONCILED  = "RECONCILED";
/** NIBSS rejected (duplicate TLI, insufficient funds, etc.) */
export const LEDGER_REJECTED    = "REJECTED";

// ─── Audit Event Types ────────────────────────────────────────────────────────
export const EVT_UNWP_INITIATED      = "UNWP_INITIATED";
export const EVT_UNWP_APPROVED_A     = "UNWP_APPROVED_A";
export const EVT_UNWP_COMPLETED      = "UNWP_COMPLETED";
export const EVT_UNWP_ESCALATED      = "UNWP_ESCALATED";
export const EVT_UNWP_BIOMETRIC_OK   = "UNWP_BIOMETRIC_OK";
export const EVT_UNWP_REJECTED       = "UNWP_REJECTED";
export const EVT_LEDGER_COMMITTED    = "LEDGER_COMMITTED";
export const EVT_LEDGER_RECONCILED   = "LEDGER_RECONCILED";
export const EVT_LEDGER_REJECTED     = "LEDGER_REJECTED";

// ─── Timing ───────────────────────────────────────────────────────────────────
/** UNWP session TTL in seconds (5 minutes) */
export const UNWP_SESSION_TTL_S  = 5 * 60;
/** TOTP step size in seconds (RFC 6238) */
export const UNWP_TOTP_STEP_S    = 30;
/** Clock-skew tolerance: ±1 step */
export const UNWP_TOTP_SKEW      = 1;

// ─── Cognitive Task Pool (Transaction-Oriented) ───────────────────────────────
/**
 * UNWP cognitive challenge types:
 *   CONFIRM_AMOUNT   — "Confirm the withdrawal amount: ₦{amount}"
 *   LAST_FOUR_DIGITS — "Enter the last 4 digits of the amount shown on the POS"
 *   ODD_OR_EVEN      — "Is the amount odd or even?"
 *   DIGIT_SUM        — "Enter the sum of the digits in the amount shown"
 */
export const UNWP_TASK_POOL = [
  "CONFIRM_AMOUNT",
  "LAST_FOUR_DIGITS",
  "ODD_OR_EVEN",
  "DIGIT_SUM",
] as const;
export type UnwpTaskType = (typeof UNWP_TASK_POOL)[number];

