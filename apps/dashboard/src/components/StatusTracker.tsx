/** 4-stage onboarding progress bar */
export type OnboardingStage = 0 | 1 | 2 | 3 | 4;

const STAGES = [
  { label: "Documents Submitted",  icon: "📋" },
  { label: "Account Verified",     icon: "🏦" },
  { label: "Liquidity Confirmed",  icon: "💰" },
  { label: "API Keys Active",      icon: "🔑" },
] as const;

interface StatusTrackerProps {
  stage: OnboardingStage; // 0 = none complete, 4 = all complete
}

export function StatusTracker({ stage }: StatusTrackerProps) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <div className="panel--gold" style={{ padding: "1.5rem 2rem" }}>
        <p className="panel-title" style={{ marginBottom: "1.25rem" }}>Onboarding Progress</p>

        {/* ── Progress bar ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: "1.25rem" }}>
          {STAGES.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STAGES.length - 1 ? 1 : "none" }}>
              {/* Node */}
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: i < stage ? "linear-gradient(135deg,#C9A84C,#8A6F32)" : i === stage ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                border: i === stage ? "2px solid var(--gold)" : i < stage ? "2px solid var(--gold-dim)" : "2px solid rgba(255,255,255,0.08)",
                fontSize: "1rem", flexShrink: 0,
                boxShadow: i < stage ? "0 0 16px rgba(201,168,76,0.4)" : "none",
                transition: "all 0.3s ease",
              }}>
                {i < stage ? "✓" : s.icon}
              </div>
              {/* Connector line (not after last) */}
              {i < STAGES.length - 1 && (
                <div style={{
                  flex: 1, height: 2,
                  background: i < stage - 1
                    ? "linear-gradient(90deg,var(--gold-dim),var(--gold-dim))"
                    : i === stage - 1
                    ? "linear-gradient(90deg,var(--gold-dim),rgba(201,168,76,0.1))"
                    : "rgba(255,255,255,0.06)",
                  transition: "background 0.4s ease",
                }} />
              )}
            </div>
          ))}
        </div>

        {/* ── Stage labels ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {STAGES.map((s, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center", fontSize: "0.68rem", fontWeight: 500,
              letterSpacing: "0.04em",
              color: i < stage ? "var(--gold)" : i === stage ? "var(--text)" : "var(--text-dim)",
              transition: "color 0.3s ease",
              padding: "0 0.25rem",
            }}>
              {s.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

