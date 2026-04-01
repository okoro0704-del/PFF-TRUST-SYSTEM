/** NIBSS 10-Meter Rule: max allowed distance between POS and location anchor. */
export const PROXIMITY_RADIUS_M = 10;

/** Standard withdrawal path: 1 of 3 biometric gates must pass (OR-gate). */
export const STANDARD_GATE_THRESHOLD = 1;

/**
 * Biometric Bypass path: 2 of 3 gates must pass.
 * Required when proximity, trusted agent, or maturity conditions are NOT met.
 */
export const BYPASS_GATE_THRESHOLD = 2;

/** Offline POS cache validity window (hours). */
export const OFFLINE_CACHE_TTL_HOURS = 24;

// ── Verification method labels (written to BepwgWithdrawalLog) ────────────────
/** Standard path, online NIBSS verification + server-side proximity check. */
export const VERIFY_METHOD_STANDARD_ONLINE  = "STANDARD_ONLINE";
/** Standard path, offline: proximity checked by POS against local encrypted cache. */
export const VERIFY_METHOD_STANDARD_OFFLINE = "STANDARD_OFFLINE";
/** Bypass path: 2/3 gates, overrides proximity/agent/maturity restrictions. */
export const VERIFY_METHOD_BYPASS_TWO_GATE  = "BYPASS_TWO_GATE";

// ── Cycle maturity labels (written to BepwgWithdrawalLog) ─────────────────────
export const MATURITY_FULL_CYCLE   = "FULL_CYCLE";
export const MATURITY_MONTH_END    = "MONTH_END";
export const MATURITY_EMERGENCY    = "EMERGENCY_BREAK";

// ── Emergency penalty (mirrors LLIW 50% liquidation penalty) ─────────────────
export const EMERGENCY_PENALTY_RATE_NUM = 50n;
export const EMERGENCY_PENALTY_RATE_DEN = 100n;

// ── Biometric gate outcome labels ──────────────────────────────────────────────
export const GATE_RESULT_MATCH    = "MATCH";
export const GATE_RESULT_NO_MATCH = "NO_MATCH";
export const GATE_RESULT_ERROR    = "ERROR";
export const GATE_RESULT_SKIPPED  = "SKIPPED";

