import { useState, useEffect, useRef } from "react";
import { BiometricGateModal } from "../components/BiometricGateModal";

const API = "/api";

interface BankEntry { code: string; name: string; shortName: string; swift: string; country: string; tier: number; cbsVendor: string; }
interface IdentityPreview { fullName: string; dateOfBirth: string; gender: string; stateOfOrigin: string; verifiedAddress: string; phoneLastThree: string; }
interface HarvestResult { sessionRef: string; preview: IdentityPreview; expiresAt: string; bankDirectory: BankEntry[]; }
interface ProvisionResult { accountNumber: string; bankName: string; accountType: string; biometricGate: string; elapsedMs: number; mandateMet: boolean; }

type Step = 1 | 2 | 3 | 4;
type Gate = "FACE" | "FINGERPRINT";

export function ZfoeOnboarding({ onBack }: { onBack: () => void }) {
  const [step, setStep]               = useState<Step>(1);
  const [msisdn, setMsisdn]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [harvest, setHarvest]         = useState<HarvestResult | null>(null);
  const [selectedBank, setSelectedBank] = useState<BankEntry | null>(null);
  const [accountType, setAccountType] = useState<"SAVINGS" | "CURRENT">("SAVINGS");
  const [showBiometric, setShowBiometric] = useState(false);
  const [gate, setGate]               = useState<Gate>("FACE");
  const [countdown, setCountdown]     = useState<number | null>(null);
  const [result, setResult]           = useState<ProvisionResult | null>(null);
  const countdownRef                  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const startCountdown = () => {
    setCountdown(60);
    countdownRef.current = setInterval(() => {
      setCountdown(c => { if (c === null || c <= 1) { clearInterval(countdownRef.current!); return 0; } return c - 1; });
    }, 1000);
  };

  // ── Step 1: Harvest identity ─────────────────────────────────────────────
  const handleHarvest = async () => {
    if (!msisdn.match(/^\+[1-9][0-9]{7,14}$/)) { setError("Enter a valid E.164 number (e.g. +2348012345678)"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/v1/zfoe/harvest`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msisdn, orgId: "default" }),
      });
      if (!res.ok) { const e = await res.json() as { message?: string }; throw new Error(e.message ?? "Harvest failed"); }
      const data = await res.json() as HarvestResult;
      setHarvest(data); setStep(2);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // ── Step 2: Select bank → BANK_SELECTED ─────────────────────────────────
  const handleBankSelect = async () => {
    if (!selectedBank) { setError("Please select a bank"); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/v1/zfoe/${harvest!.sessionRef}/bank`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode: selectedBank.code, accountType, orgId: "default" }),
      });
      if (!res.ok) { const e = await res.json() as { message?: string }; throw new Error(e.message ?? "Bank selection failed"); }
      setStep(3);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // ── Step 3: Biometric → provision (triggered after BiometricGateModal) ─
  const handleBiometricVerified = async () => {
    setShowBiometric(false); setLoading(true); setError(null); startCountdown();
    try {
      // Stub biometric template (production: capture from device camera / FAP-20 sensor)
      const stubTemplate = btoa("stub-biometric-frame-" + Date.now());
      const res = await fetch(`${API}/v1/zfoe/${harvest!.sessionRef}/provision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerBvn: "00000000000", gate, biometricTemplateB64: stubTemplate, orgId: "default" }),
      });
      if (!res.ok) { const e = await res.json() as { message?: string }; throw new Error(e.message ?? "Provision failed"); }
      const data = await res.json() as ProvisionResult;
      setResult(data); setCountdown(null); setStep(4);
    } catch (e) { setError(String(e)); setStep(3); }
    finally { setLoading(false); }
  };

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← Back</button>
        <div className="flex gap-1">
          {([1,2,3,4] as Step[]).map(s => (
            <div key={s} style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", fontSize: "0.75rem",
              background: step >= s ? "linear-gradient(135deg,var(--gold),#8A6F32)" : "rgba(255,255,255,0.05)",
              border: step === s ? "2px solid var(--gold)" : "2px solid rgba(255,255,255,0.08)",
              color: step >= s ? "#0C0C10" : "var(--text-dim)", fontWeight: 600,
              boxShadow: step >= s ? "0 0 10px rgba(201,168,76,0.4)" : "none",
            }}>{step > s ? "✓" : s}</div>
          ))}
        </div>
        <span className="text-xs dim">Zero-Friction Onboarding</span>
      </div>

      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ══════════════════════ STEP 4: SUCCESS ══════════════════════════════ */}
      {step === 4 && result && (
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>{result.mandateMet ? "🎉" : "⚠"}</div>
          <h2 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>Account Created</h2>
          <p className="muted" style={{ marginBottom: "2rem", fontSize: "0.9rem" }}>
            {result.mandateMet
              ? `Account opened in ${result.elapsedMs}ms — well within the 60-second mandate.`
              : `Account opened in ${result.elapsedMs}ms — mandate breached. Flagged for audit.`}
          </p>

          <div className="panel--gold" style={{ textAlign: "left", marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>Your New Account</p>
            <div style={{
              background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "1.5rem",
              border: "1px solid var(--gold-border)", textAlign: "center", marginBottom: "1rem",
            }}>
              <p className="text-xs dim" style={{ marginBottom: "0.4rem" }}>Account Number</p>
              <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: "1.8rem", color: "var(--gold-bright)", letterSpacing: "0.15em" }}>
                {result.accountNumber}
              </p>
            </div>
            <div className="form-grid">
              {[
                ["Bank",          result.bankName],
                ["Account Type",  result.accountType],
                ["Auth Gate",     result.biometricGate],
                ["Elapsed",       `${result.elapsedMs}ms`],
                ["Mandate",       result.mandateMet ? "✓ Met (≤60s)" : "✗ Breached"],
              ].map(([k,v]) => (
                <div key={k} style={{ padding: "0.6rem 0" }}>
                  <p className="text-xs dim" style={{ marginBottom: "0.2rem" }}>{k}</p>
                  <p style={{ fontSize: "0.88rem", color: k === "Mandate" ? (result.mandateMet ? "var(--ok)" : "var(--bad)") : "var(--text)", fontWeight: 500 }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="notice notice--ok" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>📱</span>
            <span style={{ fontSize: "0.82rem" }}>
              SMS confirmation dispatched to your BVN-linked number.
              Bring your account number to any branch or agent to activate your debit card.
            </span>
          </div>
          <button className="btn btn--gold btn--full" onClick={onBack}>← Return to Gateway</button>
        </div>
      )}

      {/* ══════════════════════ STEP 3: BIOMETRIC AUTH ════════════════════════ */}
      {step === 3 && !showBiometric && (
        <div>
          <div style={{ marginBottom: "2rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.5rem" }}>ZFOE — Step 3 of 3</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Biometric Authorization</h2>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Final step. Verify your identity via Face or Fingerprint.
              Account number is issued within <strong className="gold">60 seconds</strong> of authorization.
            </p>
          </div>

          {countdown !== null && countdown > 0 && (
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{
                width: 100, height: 100, borderRadius: "50%", margin: "0 auto 1rem",
                background: `conic-gradient(var(--gold) ${(countdown / 60) * 360}deg, rgba(255,255,255,0.06) 0deg)`,
                display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
              }}>
                <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--bg-panel)", display: "flex", alignItems: "center", justifyContent: "center", position: "absolute" }}>
                  <span style={{ fontSize: "1.5rem", fontFamily: '"JetBrains Mono",monospace', color: "var(--gold-bright)" }}>{countdown}s</span>
                </div>
              </div>
              <p className="muted text-sm">CBS push in progress — minting account…</p>
            </div>
          )}
          {(countdown === null || countdown > 0) && !loading && (
            <div className="panel--gold">
              <p className="panel-title" style={{ marginBottom: "1rem" }}>Select Biometric Gate</p>
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {(["FACE", "FINGERPRINT"] as Gate[]).map(g => (
                  <button key={g} onClick={() => setGate(g)}
                    className={gate === g ? "btn btn--outline" : "btn btn--ghost"}
                    style={{ flex: 1, justifyContent: "center" }}>
                    {g === "FACE" ? "🫦 Face Scan" : "☞ Fingerprint"}{gate === g ? " ✓" : ""}
                  </button>
                ))}
              </div>
              <div className="notice notice--info" style={{ marginBottom: "1.5rem" }}>
                <span>🔒</span>
                <span style={{ fontSize: "0.8rem" }}>NIBSS LBAS gate · Raw biometric never stored · Liveness randomized per session · 60s account minting mandate</span>
              </div>
              <button className="btn btn--gold btn--lg btn--full" onClick={() => setShowBiometric(true)}>
                Authorize with {gate === "FACE" ? "Face Scan" : "Fingerprint"} →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ STEP 2: IDENTITY CARD + BANK GRID ════════════ */}
      {step === 2 && harvest && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.5rem" }}>ZFOE — Step 2 of 3</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Confirm Identity & Select Bank</h2>
          </div>

          {/* Identity card */}
          <div className="panel--gold" style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>NIBSS Verified Identity</p>
            <div className="form-grid">
              {[
                ["Full Name",       harvest.preview.fullName],
                ["Date of Birth",   harvest.preview.dateOfBirth],
                ["Gender",          harvest.preview.gender === "M" ? "Male" : "Female"],
                ["State of Origin", harvest.preview.stateOfOrigin],
                ["Verified Address",harvest.preview.verifiedAddress],
                ["Mobile",          harvest.preview.phoneLastThree],
              ].map(([k,v]) => (
                <div key={k} style={{ padding: "0.4rem 0" }}>
                  <p className="text-xs dim" style={{ marginBottom: "0.15rem" }}>{k}</p>
                  <p style={{ fontSize: "0.88rem", color: "var(--text)", fontWeight: 500 }}>{v}</p>
                </div>
              ))}
            </div>
            <div className="notice notice--info" style={{ marginTop: "1rem" }}>
              <span>✓</span>
              <span style={{ fontSize: "0.78rem" }}>Identity fetched from NIBSS National Identity Mirror. BVN, photo, and signature hash are stored encrypted — not displayed.</span>
            </div>
          </div>

          {/* Account type */}
          <div className="panel" style={{ marginBottom: "1.25rem" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>Account Type</p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {(["SAVINGS","CURRENT"] as const).map(t => (
                <button key={t} onClick={() => setAccountType(t)}
                  className={accountType === t ? "btn btn--outline" : "btn btn--ghost"}
                  style={{ flex: 1, justifyContent: "center" }}>
                  {t === "SAVINGS" ? "🏦 Savings" : "💼 Current"}{accountType === t ? " ✓" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Bank grid */}
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>Select Bank — National Bank Grid</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: "0.75rem" }}>
              {harvest.bankDirectory.map(b => (
                <div key={b.code} onClick={() => setSelectedBank(b)} style={{
                  padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", cursor: "pointer",
                  border: selectedBank?.code === b.code ? "1px solid var(--gold)" : "1px solid var(--border)",
                  background: selectedBank?.code === b.code ? "var(--gold-glow)" : "var(--bg-surface)",
                  transition: "all var(--transition)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 600, color: selectedBank?.code === b.code ? "var(--gold-bright)" : "var(--text)" }}>{b.shortName}</span>
                    <span className={`badge ${b.country === "NG" ? "badge--gold" : "badge--dim"}`} style={{ fontSize: "0.6rem" }}>{b.country}</span>
                  </div>
                  <p className="text-xs dim" style={{ marginTop: "0.25rem" }}>{b.swift} · Tier {b.tier}</p>
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleBankSelect()} disabled={loading || !selectedBank}>
            {loading ? <><span className="spin">⏳</span> Confirming…</> : `Confirm — ${selectedBank?.name ?? "Select a bank"} →`}
          </button>
        </div>
      )}

      {/* ══════════════════════ STEP 1: MSISDN INPUT ═══════════════════════ */}
      {step === 1 && (
        <div>
          <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
            <p className="panel-title" style={{ marginBottom: "0.75rem" }}>ZFOE — Step 1 of 3</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>One-Touch Account Opening</h2>
            <p className="muted" style={{ fontSize: "0.9rem", maxWidth: 480, margin: "0 auto" }}>
              Enter your BVN-linked mobile number. The system queries the NIBSS National Identity Mirror
              and returns your verified profile in seconds — no forms, no paperwork.
            </p>
          </div>

          <div className="panel--gold" style={{ padding: "2rem" }}>
            <div className="form-group">
              <label className="form-label">BVN-Linked Mobile Number <span>*</span></label>
              <input
                className="form-input" value={msisdn} onChange={e => setMsisdn(e.target.value)}
                placeholder="+2348012345678" style={{ fontSize: "1.1rem", letterSpacing: "0.05em" }}
                onKeyDown={e => e.key === "Enter" && void handleHarvest()}
              />
              <p className="form-hint">E.164 format · Nigeria (+234) or Ghana (+233) · Used only for NIBSS lookup, never stored in plaintext</p>
            </div>

            <div className="notice notice--info" style={{ marginBottom: "1.5rem" }}>
              <span>🔒</span>
              <div style={{ fontSize: "0.8rem" }}>
                Your MSISDN is hashed with HMAC-SHA256 before storage (BVN_PEPPER key).
                The Shadow Profile is encrypted with AES-256-GCM. No raw identity data is ever logged.
              </div>
            </div>

            <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleHarvest()} disabled={loading}>
              {loading ? <><span className="spin">⏳</span> Querying NIBSS Mirror…</> : "Unlock Identity →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Biometric Modal (Step 3) ─────────────────────────────────────── */}
      {showBiometric && (
        <BiometricGateModal
          onVerified={() => void handleBiometricVerified()}
          onCancel={() => setShowBiometric(false)}
        />
      )}
    </div>
  );
}

