// ─── ZFOE Session Status ──────────────────────────────────────────────────────
export const ZFOE_INITIATED       = "INITIATED";
export const ZFOE_IDENTITY_FETCHED = "IDENTITY_FETCHED";
export const ZFOE_BANK_SELECTED   = "BANK_SELECTED";
export const ZFOE_BIOMETRIC_OK    = "BIOMETRIC_OK";
export const ZFOE_PROVISIONING    = "PROVISIONING";
export const ZFOE_COMPLETED       = "COMPLETED";
export const ZFOE_FAILED          = "FAILED";

// ─── Account Types ────────────────────────────────────────────────────────────
export const ACCT_SAVINGS         = "SAVINGS";
export const ACCT_CURRENT         = "CURRENT";

// ─── Biometric Gates ──────────────────────────────────────────────────────────
export const BIO_FACE             = "FACE";
export const BIO_FINGERPRINT      = "FINGERPRINT";

// ─── Audit Event Types ────────────────────────────────────────────────────────
export const EVT_HARVEST_INITIATED   = "ZFOE_HARVEST_INITIATED";
export const EVT_IDENTITY_FETCHED    = "ZFOE_IDENTITY_FETCHED";
export const EVT_BANK_SELECTED       = "ZFOE_BANK_SELECTED";
export const EVT_BIOMETRIC_OK        = "ZFOE_BIOMETRIC_OK";
export const EVT_PROVISION_STARTED   = "ZFOE_PROVISION_STARTED";
export const EVT_ACCOUNT_MINTED      = "ZFOE_ACCOUNT_MINTED";
export const EVT_SMS_DISPATCHED      = "ZFOE_SMS_DISPATCHED";
export const EVT_PROVISION_FAILED    = "ZFOE_PROVISION_FAILED";

// ─── Timing ───────────────────────────────────────────────────────────────────
/** ZFOE session TTL: 15 minutes from initiation */
export const ZFOE_SESSION_TTL_S      = 15 * 60;
/** 60-second account minting mandate from POST /provision call */
export const ZFOE_PROVISION_MANDATE_MS = 60_000;

