// ─── Session Status ───────────────────────────────────────────────────────────
export const BLS_INITIATED        = "INITIATED";
export const BLS_DISCOVERED       = "DISCOVERED";
export const BLS_ACCOUNT_SELECTED = "ACCOUNT_SELECTED";
export const BLS_AWAITING_SEAL    = "AWAITING_SEAL";
export const BLS_EXECUTED         = "EXECUTED";
export const BLS_EXPIRED          = "EXPIRED";
export const BLS_FAILED           = "FAILED";

// ─── Audit Event Types ────────────────────────────────────────────────────────
export const EVT_SESSION_INITIATED       = "BLS_SESSION_INITIATED";
export const EVT_DISCOVERY_SCAN_RECEIVED = "BLS_DISCOVERY_SCAN_RECEIVED";
export const EVT_DISCOVERY_ENCRYPTED     = "BLS_DISCOVERY_ENCRYPTED";
export const EVT_DISCOVERY_PURGED        = "BLS_DISCOVERY_PURGED";
export const EVT_NIBSS_DISCOVERY_MATCHED = "BLS_NIBSS_DISCOVERY_MATCHED";
export const EVT_NIBSS_DISCOVERY_NOMATCH = "BLS_NIBSS_DISCOVERY_NOMATCH";
export const EVT_ACCOUNT_MAP_BUILT       = "BLS_ACCOUNT_MAP_BUILT";
export const EVT_ACCOUNT_SELECTED        = "BLS_ACCOUNT_SELECTED";
export const EVT_AMOUNT_SET              = "BLS_AMOUNT_SET";
export const EVT_SEAL_SCAN_RECEIVED      = "BLS_SEAL_SCAN_RECEIVED";
export const EVT_SEAL_ENCRYPTED          = "BLS_SEAL_ENCRYPTED";
export const EVT_SEAL_PURGED             = "BLS_SEAL_PURGED";
export const EVT_NIBSS_SEAL_MATCHED      = "BLS_NIBSS_SEAL_MATCHED";
export const EVT_NIBSS_SEAL_NOMATCH      = "BLS_NIBSS_SEAL_NOMATCH";
export const EVT_CROSS_VALIDATION_PASSED = "BLS_CROSS_VALIDATION_PASSED";
export const EVT_CROSS_VALIDATION_FAILED = "BLS_CROSS_VALIDATION_FAILED";
export const EVT_EXECUTION_SUCCESS       = "BLS_EXECUTION_SUCCESS";
export const EVT_EXECUTION_FAILED        = "BLS_EXECUTION_FAILED";
export const EVT_ACCOUNT_MAP_WIPED       = "BLS_ACCOUNT_MAP_WIPED";
export const EVT_SESSION_EXPIRED_IDLE    = "BLS_SESSION_EXPIRED_IDLE";

// ─── Timing ───────────────────────────────────────────────────────────────────
/** Rolling 60-second idle timer — reset on every API activity */
export const BLS_IDLE_TTL_S       = 60;
/** Hard session ceiling from initiation */
export const BLS_SESSION_TTL_S    = 15 * 60;

// ─── Zero-Knowledge Storage Rule ─────────────────────────────────────────────
/**
 * Fields that must NEVER be persisted in plaintext, and must be zeroed post-execution:
 * - Raw account numbers (stored only in AES-GCM blob, wiped after execution)
 * - Real-time balances (same — encrypted blob only)
 * - Raw fingerprint minutiae (only SHA-256 hash of encrypted template stored)
 */
export const ZK_PROTECTED_FIELDS = ["accountNumbers","balances","rawMinutiae"] as const;

