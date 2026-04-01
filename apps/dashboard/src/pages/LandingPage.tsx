interface LandingPageProps {
  onApply:   () => void;
  onMonitor: () => void;
  onZfoe:    () => void;
  onBih:     () => void;
  onBls:     () => void;
  onBlide:   () => void;
  onCasd:    () => void;
  onRscc:    () => void;
  onZfps:    () => void;
}

const PILLARS = [
  {
    num: "01",
    icon: "🔐",
    title: "BSSS — Triple-Gate Biometric Lock",
    tag: "Biometric Secure Saving System",
    desc: "Fraud-proof POS lock enforcing Fingerprint, Face, and Mobile verification in parallel. No card, no PIN, no password — identity is the credential. NIBSS-gated with Second Watch anomaly detection.",
  },
  {
    num: "02",
    icon: "⚡",
    title: "Sovereign Execution Rail",
    tag: "Networkless Transaction Engine",
    desc: "Cardless, passwordless, and networkless transaction execution. TOTP challenge-response with a 30-second rotating code. Transactions commit offline, reconcile with NIBSS on connectivity restore.",
  },
  {
    num: "03",
    icon: "🏦",
    title: "Secured Saving (Ajo) Layer",
    tag: "Agent-Led Micro-Saving Protocol",
    desc: "31-day savings cycles with bank-vaulted micro-deposits. Agents earn 2% of their 60% liquidity stake daily. Withdrawals locked behind Tri-Condition Gates with a 50% Emergency Penalty override.",
  },
  {
    num: "04",
    icon: "📍",
    title: "Biometric Exchequer Gate",
    tag: "Proximity & Challenge-Response",
    desc: "10-meter Haversine GPS anchor with HMAC-encrypted offline cache. Trusted Agent Links enable 1-gate withdrawals. Biometric Bypass requires 2/3 gates when proximity or maturity conditions are not met.",
  },
] as const;

const STATS = [
  { value: "67",   label: "API Endpoints",      sub: "Type-safe & Swagger-documented" },
  { value: "0",    label: "Diagnostics",         sub: "Across all modules" },
  { value: "RFC 6238", label: "TOTP Standard",   sub: "HMAC-SHA1 · 30s step · ±1 skew" },
  { value: "AES-256-GCM", label: "Encryption",   sub: "All biometric seeds & ledger payloads" },
] as const;

export function LandingPage({ onApply, onMonitor, onZfoe, onBih, onBls, onBlide, onCasd, onRscc, onZfps }: LandingPageProps) {
  return (
    <div>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={{
        minHeight: "82vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        padding: "4rem 2rem", position: "relative",
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,168,76,0.08) 0%, transparent 70%)",
      }}>
        <div style={{ marginBottom: "1.5rem" }}>
          <span className="badge badge--gold" style={{ fontSize: "0.65rem", letterSpacing: "0.18em" }}>
            ◈ INSTITUTIONAL ACCESS PORTAL
          </span>
        </div>

        <h1 className="serif" style={{ fontSize: "clamp(2.5rem,6vw,5rem)", marginBottom: "1.5rem", lineHeight: 1.05 }}>
          The <span style={{ color: "var(--gold-bright)" }}>Life OS</span><br />
          Institutional Gateway
        </h1>

        <p style={{
          maxWidth: 640, fontSize: "1.05rem", color: "var(--text-muted)",
          lineHeight: 1.75, marginBottom: "3rem",
        }}>
          License Africa's most advanced biometric financial infrastructure. Built for central banks,
          commercial lenders, and licensed fintechs operating under CBN, BoG, and Sovereign frameworks.
        </p>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn btn--gold btn--lg" onClick={onApply}>
            Apply for API Access →
          </button>
          <button className="btn btn--gold btn--lg" onClick={onBlide}>
            🫦 Active-Liveness Face Pay (BLIDE)
          </button>
          <button className="btn btn--outline" onClick={onZfps} style={{ padding: "0.9rem 1.75rem" }}>
            ⚡ Zero-Friction Provisioning Stack (ZFPS)
          </button>
          <button className="btn btn--outline" onClick={onRscc} style={{ padding: "0.9rem 1.75rem" }}>
            💰 Revenue &amp; Settlement Center (RSCC)
          </button>
          <button className="btn btn--outline" onClick={onCasd} style={{ padding: "0.9rem 1.75rem" }}>
            ⚙️ Command Center (CASD)
          </button>
          <button className="btn btn--outline" onClick={onBls}>
            🔍 Liquidity Sweep (BLS-TSA)
          </button>
          <button className="btn btn--outline" onClick={onBih} style={{ padding: "0.9rem 1.75rem" }}>
            ☞ Scan-to-Onboard (BIH)
          </button>
          <button className="btn btn--ghost" onClick={onZfoe} style={{ padding: "0.9rem 1.75rem" }}>
            🏦 MSISDN Onboarding (ZFOE)
          </button>
          <button className="btn btn--ghost" onClick={onMonitor} style={{ padding: "0.9rem 1.75rem" }}>
            ⚡ Live Monitor
          </button>
        </div>

        {/* Subtle gold rule */}
        <div style={{ position: "absolute", bottom: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg,transparent,var(--gold-border),transparent)" }} />
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "2rem" }}>
        <div className="container">
          <div className="grid-4">
            {STATS.map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div className="stat-value gold-bright" style={{ fontSize: "1.8rem", marginBottom: "0.3rem" }}>{s.value}</div>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.2rem" }}>{s.label}</div>
                <div className="text-xs dim">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Four Pillars ──────────────────────────────────────────────────── */}
      <div className="container" style={{ padding: "5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <p className="panel-title" style={{ marginBottom: "0.75rem" }}>Architecture</p>
          <h2 className="serif">The Four Pillars of the Life OS</h2>
          <p className="muted" style={{ maxWidth: 540, margin: "1rem auto 0", fontSize: "0.9rem" }}>
            Each pillar operates as an independent, composable module — license one or deploy the full sovereign stack.
          </p>
        </div>

        <div className="grid-2">
          {PILLARS.map((p) => (
            <div key={p.num} className="pillar-card">
              <span className="pillar-number">{p.num}</span>
              <span className="pillar-icon">{p.icon}</span>
              <p className="text-xs gold" style={{ marginBottom: "0.4rem", letterSpacing: "0.12em", textTransform: "uppercase" }}>{p.tag}</p>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          ))}
        </div>

        {/* ── CTA footer ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: "5rem", textAlign: "center" }}>
          <div className="panel--gold" style={{ maxWidth: 680, margin: "0 auto", padding: "2.5rem" }}>
            <h3 className="serif" style={{ fontSize: "1.8rem", marginBottom: "0.75rem", color: "var(--gold-bright)" }}>
              Ready to Begin?
            </h3>
            <p className="muted" style={{ marginBottom: "2rem", fontSize: "0.92rem", lineHeight: 1.7 }}>
              Institutional onboarding requires regulatory documentation, a dedicated F-Man Technologies
              corporate account, and a liquidity commitment to fund agent commissions and API operations.
            </p>
            <button className="btn btn--gold btn--lg btn--full" onClick={onApply}>
              Begin Access Application →
            </button>
            <p className="text-xs dim" style={{ marginTop: "1rem" }}>
              Regulated under CBN Framework · AML/KYC compliant · Biometric signatory required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

