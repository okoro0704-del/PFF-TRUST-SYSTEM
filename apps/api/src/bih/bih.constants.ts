// ─── Scan Session Status ──────────────────────────────────────────────────────
export const BIH_SCAN_REQUESTED     = "SCAN_REQUESTED";
export const BIH_NIBSS_MATCHED      = "NIBSS_MATCHED";
export const BIH_IDENTITY_UNLOCKED  = "IDENTITY_UNLOCKED";
export const BIH_BANK_SELECTED      = "BANK_SELECTED";
export const BIH_PROVISIONING       = "PROVISIONING";
export const BIH_COMPLETED          = "COMPLETED";
export const BIH_FAILED             = "FAILED";
export const BIH_NO_MATCH           = "NO_MATCH";

// ─── Transaction Types ────────────────────────────────────────────────────────
export const TXN_ACCOUNT_SETUP      = "ACCOUNT_SETUP";
export const TXN_WITHDRAWAL         = "WITHDRAWAL";
export const TXN_TRANSFER           = "TRANSFER";
export const TXN_BILL_PAYMENT       = "BILL_PAYMENT";

// ─── Bank Provisioning Status ─────────────────────────────────────────────────
export const PROV_PENDING           = "PENDING";
export const PROV_SUCCESS           = "SUCCESS";
export const PROV_FAILED            = "FAILED";

// ─── Audit Event Types ────────────────────────────────────────────────────────
export const EVT_SCAN_INITIATED     = "BIH_SCAN_INITIATED";
export const EVT_TEMPLATE_ENCRYPTED = "BIH_TEMPLATE_ENCRYPTED";
export const EVT_TEMPLATE_PURGED    = "BIH_TEMPLATE_PURGED";
export const EVT_NIBSS_PING_SENT    = "BIH_NIBSS_PING_SENT";
export const EVT_NIBSS_MATCHED      = "BIH_NIBSS_MATCHED";
export const EVT_NIBSS_NO_MATCH     = "BIH_NIBSS_NO_MATCH";
export const EVT_IDENTITY_UNLOCKED  = "BIH_IDENTITY_UNLOCKED";
export const EVT_BANK_SELECTED      = "BIH_BANK_SELECTED";
export const EVT_PROVISION_STARTED  = "BIH_PROVISION_STARTED";
export const EVT_ACCOUNT_MINTED     = "BIH_ACCOUNT_MINTED";
export const EVT_PROVISION_FAILED   = "BIH_PROVISION_FAILED";
export const EVT_GATE_WITHDRAWAL    = "BIH_GATE_WITHDRAWAL";
export const EVT_GATE_TRANSFER      = "BIH_GATE_TRANSFER";
export const EVT_GATE_BILL_PAYMENT  = "BIH_GATE_BILL_PAYMENT";
export const EVT_GATE_AUTHORIZED    = "BIH_GATE_AUTHORIZED";
export const EVT_GATE_DENIED        = "BIH_GATE_DENIED";

// ─── Timing ───────────────────────────────────────────────────────────────────
/** BIH scan session TTL: 10 minutes */
export const BIH_SESSION_TTL_S         = 10 * 60;
/** Sub-3-second NIBSS matching target */
export const BIH_NIBSS_TARGET_MS       = 3_000;
/** 60-second account minting mandate (same as ZFOE) */
export const BIH_PROVISION_MANDATE_MS  = 60_000;

// ─── Zero-Input Rule ──────────────────────────────────────────────────────────
/**
 * Fields that are STRICTLY PROHIBITED from user input during ACCOUNT_SETUP.
 * Only the NIBSS-fetched shadow profile may supply these values.
 */
export const ZERO_INPUT_PROTECTED_FIELDS = ["fullName","firstName","lastName","dateOfBirth","address","gender","stateOfOrigin"] as const;

