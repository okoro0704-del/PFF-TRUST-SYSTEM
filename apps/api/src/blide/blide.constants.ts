// ─── Session Status ───────────────────────────────────────────────────────────
export const BLIDE_INITIATED          = "INITIATED";
export const BLIDE_FACE_CAPTURED      = "FACE_CAPTURED";
export const BLIDE_NIBSS_MATCHED      = "NIBSS_MATCHED";
export const BLIDE_IDENTITY_UNLOCKED  = "IDENTITY_UNLOCKED";
export const BLIDE_TARGET_SELECTED    = "TARGET_SELECTED";
export const BLIDE_LIVENESS_CHALLENGED= "LIVENESS_CHALLENGED";
export const BLIDE_LIVENESS_VERIFIED  = "LIVENESS_VERIFIED";
export const BLIDE_EXECUTING          = "EXECUTING";
export const BLIDE_COMPLETED          = "COMPLETED";
export const BLIDE_FAILED             = "FAILED";
export const BLIDE_NO_MATCH           = "NO_MATCH";
export const BLIDE_LIVENESS_FAILED    = "LIVENESS_FAILED";

// ─── Transaction Types ────────────────────────────────────────────────────────
export const BLIDE_TXN_ACCOUNT_SETUP  = "ACCOUNT_SETUP";
export const BLIDE_TXN_WITHDRAWAL     = "WITHDRAWAL";
export const BLIDE_TXN_TRANSFER       = "TRANSFER";
export const BLIDE_TXN_BILL_PAYMENT   = "BILL_PAYMENT";

// ─── Liveness Challenge Types (7 tasks) ──────────────────────────────────────
export const LIVENESS_POOL = [
  { type: "BLINK_TWICE",    prompt: "Blink twice slowly",           icon: "👁",  instruction: "Close and open your eyes twice, slowly and deliberately." },
  { type: "SMILE_TEETH",    prompt: "Smile and show your teeth",    icon: "😁",  instruction: "Give a full smile with your teeth visible to the camera." },
  { type: "OPEN_MOUTH",     prompt: "Open your mouth wide",         icon: "😮",  instruction: "Open your mouth fully for 2 seconds." },
  { type: "TURN_LEFT",      prompt: "Turn your head left slowly",   icon: "◀️",  instruction: "Rotate your head to the left until your ear faces the camera." },
  { type: "TURN_RIGHT",     prompt: "Turn your head right slowly",  icon: "▶️",  instruction: "Rotate your head to the right until your ear faces the camera." },
  { type: "NOD_HEAD",       prompt: "Nod your head once",           icon: "⬇️",  instruction: "Lower your chin toward your chest, then raise it back up." },
  { type: "RAISE_EYEBROWS", prompt: "Raise both eyebrows",          icon: "🤨",  instruction: "Raise both eyebrows as high as possible for 2 seconds." },
] as const;

export type LivenessChallengeType = typeof LIVENESS_POOL[number]["type"];

// ─── Audit Event Types ────────────────────────────────────────────────────────
export const EVT_BLIDE_SESSION_STARTED      = "BLIDE_SESSION_STARTED";
export const EVT_BLIDE_FACE_RECEIVED        = "BLIDE_FACE_RECEIVED";
export const EVT_BLIDE_FACE_ENCRYPTED       = "BLIDE_FACE_ENCRYPTED";
export const EVT_BLIDE_FACE_PURGED          = "BLIDE_FACE_PURGED";
export const EVT_BLIDE_NIBSS_PING           = "BLIDE_NIBSS_PING";
export const EVT_BLIDE_NIBSS_MATCHED        = "BLIDE_NIBSS_MATCHED";
export const EVT_BLIDE_NIBSS_NO_MATCH       = "BLIDE_NIBSS_NO_MATCH";
export const EVT_BLIDE_IDENTITY_UNLOCKED    = "BLIDE_IDENTITY_UNLOCKED";
export const EVT_BLIDE_ACCOUNT_MAP_BUILT    = "BLIDE_ACCOUNT_MAP_BUILT";
export const EVT_BLIDE_TARGET_SELECTED      = "BLIDE_TARGET_SELECTED";
export const EVT_BLIDE_CHALLENGE_ISSUED     = "BLIDE_CHALLENGE_ISSUED";
export const EVT_BLIDE_LIVENESS_RESPONSE    = "BLIDE_LIVENESS_RESPONSE";
export const EVT_BLIDE_LIVENESS_VERIFIED    = "BLIDE_LIVENESS_VERIFIED";
export const EVT_BLIDE_LIVENESS_FAILED      = "BLIDE_LIVENESS_FAILED";
export const EVT_BLIDE_LIVENESS_REPLAY      = "BLIDE_LIVENESS_REPLAY_BLOCKED";
export const EVT_BLIDE_EXECUTING            = "BLIDE_EXECUTING";
export const EVT_BLIDE_COMPLETED            = "BLIDE_COMPLETED";
export const EVT_BLIDE_EXECUTION_FAILED     = "BLIDE_EXECUTION_FAILED";
export const EVT_BLIDE_ACCOUNTS_WIPED       = "BLIDE_ACCOUNTS_WIPED";

// ─── Timing ───────────────────────────────────────────────────────────────────
/** Hard session ceiling: 5 minutes total */
export const BLIDE_SESSION_TTL_S      = 5 * 60;
/** Liveness challenge window: 30 seconds per task */
export const BLIDE_CHALLENGE_TTL_S    = 30;
/** Sub-60-second mandate: Discovery → Completion */
export const BLIDE_MANDATE_MS         = 60_000;

