// ─── Provisioning Status ──────────────────────────────────────────────────────
export const ZFPS_PROVISIONING  = "PROVISIONING";
export const ZFPS_COMPLETED     = "COMPLETED";
export const ZFPS_FAILED        = "FAILED";
export const ZFPS_VAULT_EXPIRED = "VAULT_EXPIRED";

// ─── SMS Provider ─────────────────────────────────────────────────────────────
export const SMS_TERMII  = "TERMII";
export const SMS_TWILIO  = "TWILIO";
export const SMS_STUB    = "STUB";

// ─── SMS Message Types ────────────────────────────────────────────────────────
export const SMS_ACCOUNT_CREATED = "ACCOUNT_CREATED";
export const SMS_OTP             = "OTP";
export const SMS_ALERT           = "ALERT";

// ─── SMS Delivery Status ──────────────────────────────────────────────────────
export const SMS_SENT      = "SENT";
export const SMS_DELIVERED = "DELIVERED";
export const SMS_FAILED    = "FAILED";

// ─── CBS Operation Types (for latency logging) ────────────────────────────────
export const CBS_ACCOUNT_OPENING = "ACCOUNT_OPENING";
export const CBS_BALANCE_QUERY   = "BALANCE_QUERY";
export const CBS_TRANSFER        = "TRANSFER";
export const CBS_BILL_PAYMENT    = "BILL_PAYMENT";

// ─── Redis Key Prefixes ───────────────────────────────────────────────────────
export const REDIS_VAULT_PREFIX   = "zfps:vault:";
export const REDIS_STATE_PREFIX   = "zfps:state:";
export const REDIS_LATENCY_PREFIX = "zfps:latency:";

// ─── Timing & Thresholds ──────────────────────────────────────────────────────
/** NDPR compliance window: identity data self-destructs after 60 seconds */
export const VAULT_TTL_SECONDS          = 60;
/** Redis session state TTL (5 minutes) */
export const SESSION_STATE_TTL_SECONDS  = 300;
/** Maximum latency records kept per bank in Redis sliding window */
export const LATENCY_WINDOW_SIZE        = 10;
/** Default bank API alert threshold in milliseconds (45 seconds) */
export const DEFAULT_LATENCY_ALERT_MS   = 45_000;
/** Sub-60s biometric provisioning mandate (ZFPS target) */
export const ZFPS_MANDATE_MS            = 60_000;

// ─── ISO 20022 ────────────────────────────────────────────────────────────────
export const ISO20022_NAMESPACE = "urn:iso:std:iso:20022:tech:xsd:acmt.001.001.08";
export const ISO20022_MSG_TYPE  = "acmt.001.001.08";
/** F-Man Technologies institution BIC (placeholder — use real BIC in production) */
export const FMAN_INSTITUTION_BIC = "FMTGNGLA";
export const FMAN_ORG_NAME        = "F-Man Technologies Limited";
export const FMAN_LEI             = "FMAN-LEI-NG-00001";

// ─── Termii API ──────────────────────────────────────────────────────────────
export const TERMII_BASE_URL     = "https://api.ng.termii.com";
export const TERMII_SMS_ENDPOINT = "/api/sms/send";
export const TERMII_CHANNEL      = "generic";
export const TERMII_MSG_TYPE     = "plain";

// ─── FIDO2 / Biometric Flags ──────────────────────────────────────────────────
/** Minimum liveness confidence score (0–100) required before NIBSS ping */
export const FIDO2_MIN_LIVENESS_SCORE = 85;
/** Face template format accepted by NIBSS CBRS */
export const NIBSS_FACE_FORMAT        = "ISO_19794_5";
/** Fingerprint template format accepted by NIBSS FAS */
export const NIBSS_FP_FORMAT          = "ISO_19794_2";

// ─── gRPC Service Definition Reference ──────────────────────────────────────
/** Proto file path — used by NestJS microservices bootstrap */
export const ZFPS_GRPC_PROTO_PATH   = "src/zfps/proto/zfps.proto";
export const ZFPS_GRPC_PACKAGE      = "zfps";
export const ZFPS_GRPC_SERVICE      = "ZfpsService";

