// ── Financial ratios (exact — used in Decimal arithmetic, not floating point) ──

/** 60% of the Day-1 First Payment is the Agent Liquidity stake. */
export const AGENT_LIQUIDITY_RATIO_NUM = 60n;
export const AGENT_LIQUIDITY_RATIO_DEN = 100n;

/** Daily incentive = 2% of the Agent Liquidity stake (System-to-Agent CBS transfer). */
export const AGENT_INCENTIVE_RATE_NUM = 2n;
export const AGENT_INCENTIVE_RATE_DEN = 100n;

/** Emergency Break penalty = 50% of totalSavedToDate. */
export const EMERGENCY_PENALTY_RATE_NUM = 50n;
export const EMERGENCY_PENALTY_RATE_DEN = 100n;

/** Number of daily deposits that constitute a full savings cycle. */
export const FULL_CYCLE_DAYS = 31;

// ── Cycle status ───────────────────────────────────────────────────────────────
export const CYCLE_ACTIVE              = "ACTIVE";
export const CYCLE_MATURED_FULL_CYCLE  = "MATURED_FULL_CYCLE";
export const CYCLE_MATURED_MONTH_END   = "MATURED_MONTH_END";
export const CYCLE_BROKEN              = "BROKEN";
export const CYCLE_WITHDRAWN           = "WITHDRAWN";

// ── Withdrawal Gate status (server-side only — clients CANNOT set these) ───────
export const GATE_LOCKED            = "LOCKED";
export const GATE_OPEN_FULL_CYCLE   = "OPEN_FULL_CYCLE";
export const GATE_OPEN_MONTH_END    = "OPEN_MONTH_END";
export const GATE_OPEN_EMERGENCY    = "OPEN_EMERGENCY";

// ── Agent incentive payout status ─────────────────────────────────────────────
export const INCENTIVE_PENDING  = "PENDING";
export const INCENTIVE_SETTLED  = "SETTLED";
export const INCENTIVE_FAILED   = "FAILED";

