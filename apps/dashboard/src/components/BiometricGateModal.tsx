import { useState } from "react";

interface BiometricGateModalProps {
  onVerified: () => void;
  onCancel:   () => void;
}

type Gate = "FACE" | "FINGERPRINT";
type State = "idle" | "scanning" | "verified" | "failed";

export function BiometricGateModal({ onVerified, onCancel }: BiometricGateModalProps) {
  const [gate, setGate]   = useState<Gate>("FACE");
  const [state, setState] = useState<State>("idle");

  const runScan = () => {
    setState("scanning");
    // Stub: simulate NIBSS biometric call (replace with real LBAS API in production)
    setTimeout(() => {
      setState("verified");
      setTimeout(onVerified, 900);
    }, 2200);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
            {state === "verified" ? "✅" : state === "failed" ? "❌" : gate === "FACE" ? "🫦" : "☞"}
          </div>
          <h3 className="modal__title">Biometric Verification Required</h3>
          <p className="modal__sub">
            Your organization's authorized biometric signatory must pass a{" "}
            <span className="gold">Face or Fingerprint</span> NIBSS gate before accessing
            sensitive liquidity data.
          </p>
        </div>

        {/* ── Gate selector ──────────────────────────────────────────────── */}
        {state === "idle" && (
          <>
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {(["FACE", "FINGERPRINT"] as Gate[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGate(g)}
                  className={gate === g ? "btn btn--outline" : "btn btn--ghost"}
                  style={{ flex: 1, justifyContent: "center", fontSize: "0.82rem" }}
                >
                  {g === "FACE" ? "🫦 Face Scan" : "☞ Fingerprint"}
                </button>
              ))}
            </div>

            <div className="notice notice--info" style={{ marginBottom: "1.5rem" }}>
              <span>🔒</span>
              <span style={{ fontSize: "0.8rem" }}>
                Powered by the LBAS FAP-20 + NIBSS gate. Raw biometric data is never stored.
                Liveness challenge is randomised per session.
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button className="btn btn--ghost btn--sm" onClick={onCancel} style={{ flex: 1, justifyContent: "center" }}>
                Cancel
              </button>
              <button className="btn btn--gold" onClick={runScan} style={{ flex: 2, justifyContent: "center" }}>
                Begin {gate === "FACE" ? "Face" : "Fingerprint"} Scan →
              </button>
            </div>
          </>
        )}

        {/* ── Scanning state ─────────────────────────────────────────────── */}
        {state === "scanning" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: "3px solid transparent",
              borderTopColor: "var(--gold)",
              borderLeftColor: "var(--gold-dim)",
              animation: "spin 1s linear infinite",
              margin: "0 auto 1.25rem",
            }} />
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              {gate === "FACE" ? "Liveness detection in progress — follow the on-screen prompts…" : "Reading FAP-20 sensor — place finger firmly on the sensor…"}
            </p>
            <p className="text-xs dim" style={{ marginTop: "0.5rem" }}>
              NIBSS FAS gate — session expires in 90s
            </p>
          </div>
        )}

        {/* ── Verified state ─────────────────────────────────────────────── */}
        {state === "verified" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <p className="ok" style={{ fontWeight: 600 }}>Identity Confirmed — NIBSS MatchFound</p>
            <p className="text-sm muted" style={{ marginTop: "0.4rem" }}>Redirecting to secure view…</p>
          </div>
        )}

        {/* ── Failed state ───────────────────────────────────────────────── */}
        {state === "failed" && (
          <div>
            <p className="bad" style={{ marginBottom: "1rem", fontWeight: 600 }}>
              Biometric verification failed — NIBSS NoMatch
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button className="btn btn--ghost btn--sm" onClick={onCancel} style={{ flex: 1, justifyContent: "center" }}>Abort</button>
              <button className="btn btn--outline btn--sm" onClick={() => setState("idle")} style={{ flex: 2, justifyContent: "center" }}>Retry</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

