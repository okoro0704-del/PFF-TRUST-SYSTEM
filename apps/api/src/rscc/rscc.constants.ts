// ─── License Status ───────────────────────────────────────────────────────────
export const LIC_ACTIVE        = "ACTIVE";
export const LIC_EXPIRING_SOON = "EXPIRING_SOON";   // < 7 days remaining
export const LIC_SUSPENDED     = "SUSPENDED";        // Day 0 — API restricted
export const LIC_RENEWED       = "RENEWED";

// ─── Switching Toll Types ──────────────────────────────────────────────────────
export const TOLL_NIBSS_YES    = "NIBSS_YES_CALL";
export const TOLL_TRANSFER     = "TRANSFER";
export const TOLL_BILL_PAYMENT = "BILL_PAYMENT";
export const TOLL_WITHDRAWAL   = "WITHDRAWAL";

// ─── Session Types ────────────────────────────────────────────────────────────
export const SESSION_BIH       = "BIH";
export const SESSION_BLIDE     = "BLIDE_FACE";
export const SESSION_BLS       = "BLS_FINGERPRINT";

// ─── Ajo Status & Day-1 Fee Status ────────────────────────────────────────────
export const AJO_ACTIVE    = "ACTIVE";
export const AJO_COMPLETED = "COMPLETED";
export const AJO_BROKEN    = "BROKEN";
export const AJO_SUSPENDED = "SUSPENDED";
export const FEE_COLLECTED = "COLLECTED";
export const FEE_PENDING   = "PENDING";
export const FEE_FAILED    = "FAILED";

// ─── Distribution Status ──────────────────────────────────────────────────────
export const DIST_DISBURSED = "DISBURSED";
export const DIST_PENDING   = "PENDING_CONFIRMATION";

// ─── Red Flag Types & Severity ────────────────────────────────────────────────
export const FLAG_LOW_BALANCE  = "LOW_DEDICATED_ACCOUNT";
export const FLAG_LIC_EXPIRING = "LICENSE_EXPIRING";
export const FLAG_AJO_BREAK    = "AJO_SAFE_BREAK";
export const FLAG_SWITCH_ANOM  = "SWITCHING_ANOMALY";
export const SEV_LOW           = "LOW";
export const SEV_MEDIUM        = "MEDIUM";
export const SEV_HIGH          = "HIGH";
export const SEV_CRITICAL      = "CRITICAL";

// ─── Financial Constants ──────────────────────────────────────────────────────
/** License validity period */
export const LIC_DURATION_DAYS       = 31;
/** Threshold for EXPIRING_SOON badge */
export const LIC_EXPIRY_WARN_DAYS    = 7;
/** Annual renewal fee: ₦500,000 */
export const LIC_RENEWAL_FEE_MINOR   = 50_000_000n;

// Switching toll rates (in kobo)
export const TOLL_YES_FEE_MINOR      = 5_000n;   // ₦50 flat per NIBSS YES call
export const TOLL_TRANSFER_PCT       = 0.005;     // 0.5% of transfer amount
export const TOLL_TRANSFER_MIN       = 10_000n;   // ₦100 minimum
export const TOLL_TRANSFER_MAX       = 100_000n;  // ₦1,000 maximum
export const TOLL_BILL_FEE_MINOR     = 10_000n;   // ₦100 flat per bill payment
export const TOLL_WITHDRAWAL_PCT     = 0.003;     // 0.3% of withdrawal amount
export const TOLL_WITHDRAWAL_MIN     = 5_000n;    // ₦50 minimum
export const TOLL_WITHDRAWAL_MAX     = 50_000n;   // ₦500 maximum

// Ajo & distribution
export const AJO_DAY1_FEE_MINOR      = 50_000n;  // ₦500 Day-1 first payment
export const AJO_SAFE_BREAK_PCT      = 50;        // 50% penalty on principal
export const SPLIT_FMAN_PCT          = 40;
export const SPLIT_AGENT_PCT         = 60;
export const DAILY_REWARD_PCT        = 2;          // 2% of agent pool credited daily
export const TOTAL_ELIGIBLE_AGENTS   = 120;        // stub: national agent network size

/** Dedicated account must cover at least 48h of projected agent payouts */
export const RED_FLAG_HOURS_THRESHOLD = 48;

// ─── Demo Seed Config ─────────────────────────────────────────────────────────
export const DEMO_LICENSES = [
  { code: "044150149", name: "Access Bank PLC",         daysAgo: 26, balance: 380_000_000n },  // 5d left → EXPIRING_SOON
  { code: "058063220", name: "Guaranty Trust Bank PLC", daysAgo: 13, balance: 5_200_000_000n },// 18d left → ACTIVE
  { code: "070090905", name: "LAPO Microfinance Bank",  daysAgo: 32, balance:    450_000n },   // 0d left  → SUSPENDED ← red-flag
  { code: "999991",    name: "OPay Digital Services",   daysAgo:  9, balance: 2_100_000_000n },// 22d left → ACTIVE
] as const;

export const NIGERIAN_STATES = [
  "Lagos","Kano","Abuja","Rivers","Anambra","Oyo","Kaduna","Delta","Enugu","Imo",
  "Borno","Ogun","Bauchi","Edo","Akwa Ibom","Plateau","Sokoto","Benue",
] as const;

export const NIGERIAN_LGAS: Record<string, string[]> = {
  Lagos:   ["Ikeja","Surulere","Ojo","Alimosho","Kosofe"],
  Kano:    ["Kano Municipal","Gwale","Tarauni","Fagge"],
  Abuja:   ["Abuja Municipal","Bwari","Gwagwalada","Kuje"],
  Rivers:  ["Port Harcourt","Obio/Akpor","Eleme","Ogba/Egbema/Ndoni"],
  Anambra: ["Awka South","Onitsha","Nnewi North","Idemili North"],
  Oyo:     ["Ibadan North","Ibadan South-East","Egbeda","Oluyole"],
  default: ["Central","North","South","East"],
};

