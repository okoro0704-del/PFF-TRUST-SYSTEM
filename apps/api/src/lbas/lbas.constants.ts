// ── Liveness challenge task pool ───────────────────────────────────────────────
export const LIVENESS_TASK_POOL = [
  "BLINK_TWICE", "OPEN_MOUTH", "HEAD_TURN_LEFT", "HEAD_TURN_RIGHT", "SMILE", "NOD",
] as const;
export type LivenessTask = typeof LIVENESS_TASK_POOL[number];

/** Minimum sequence length to prevent trivial replay (1 task is allowed for accessibility). */
export const LIVENESS_MIN_TASKS = 1;
export const LIVENESS_MAX_TASKS = 3;

// ── Optical-flow proof validation thresholds ───────────────────────────────────
/** Minimum combined liveness confidence score (0-1). */
export const LIVENESS_MIN_SCORE         = 0.80;
/** Minimum depth-variance score — distinguishes 3-D face from flat photo. */
export const LIVENESS_DEPTH_THRESHOLD  = 0.70;
/** Minimum video frames submitted per task (prevents single-frame replay). */
export const LIVENESS_MIN_FRAMES       = 8;
/** Session TTL in seconds — challenges expire and become invalid after this. */
export const LIVENESS_CHALLENGE_TTL_S  = 90;

// ── Liveness session status ────────────────────────────────────────────────────
export const LIVENESS_PENDING     = "PENDING";
export const LIVENESS_IN_PROGRESS = "IN_PROGRESS";
export const LIVENESS_COMPLETED   = "COMPLETED";
export const LIVENESS_FAILED      = "FAILED";
export const LIVENESS_EXPIRED     = "EXPIRED";

// ── External sensor status ─────────────────────────────────────────────────────
export const SENSOR_REGISTERED   = "REGISTERED";
export const SENSOR_ACTIVE       = "ACTIVE";
export const SENSOR_DISCONNECTED = "DISCONNECTED";
export const SENSOR_REVOKED      = "REVOKED";

// ── Networkless session status ─────────────────────────────────────────────────
export const NET_INITIATED   = "INITIATED";
export const NET_APPROVED_A  = "APPROVED_STEP_A";
export const NET_CONFIRMED_B = "CONFIRMED_STEP_B";
export const NET_COMPLETED   = "COMPLETED";
export const NET_REJECTED    = "REJECTED";
export const NET_EXPIRED     = "EXPIRED";

// ── TOTP parameters (RFC 6238) ─────────────────────────────────────────────────
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS       = 6;
/** Accept codes from adjacent steps to allow for clock skew. */
export const TOTP_WINDOW       = 1;
/** Networkless session TTL — POS and phone must complete within this window. */
export const NETWORKLESS_SESSION_TTL_S = 120;

// ── LBAS audit event types ─────────────────────────────────────────────────────
export const EVT_LIVENESS_ISSUED    = "LIVENESS_ISSUED";
export const EVT_LIVENESS_COMPLETED = "LIVENESS_COMPLETED";
export const EVT_LIVENESS_FAILED    = "LIVENESS_FAILED";
export const EVT_LIVENESS_EXPIRED   = "LIVENESS_EXPIRED";
export const EVT_SENSOR_REGISTERED  = "SENSOR_REGISTERED";
export const EVT_FP_SUBMITTED       = "FINGERPRINT_SUBMITTED";
export const EVT_NET_INITIATED      = "NET_INITIATED";
export const EVT_NET_APPROVED_A     = "NET_APPROVED_A";
export const EVT_NET_CONFIRMED_B    = "NET_CONFIRMED_B";
export const EVT_NET_COMPLETED      = "NET_COMPLETED";
export const EVT_NET_REJECTED       = "NET_REJECTED";

