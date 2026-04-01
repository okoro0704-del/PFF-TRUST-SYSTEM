import { useState, useEffect, useRef } from "react";

const API = "/api";
type TxnType = "ACCOUNT_SETUP" | "WITHDRAWAL" | "TRANSFER" | "BILL_PAYMENT";
type Step = "mode" | "scanning" | "nibss" | "identity" | "operation" | "result";

interface BankEntry { code: string; name: string; shortName: string; swift: string; country: string; tier: number; }
interface IdentityPreview { fullName: string; dateOfBirth: string; gender: string; stateOfOrigin: string; addressSummary: string; }
interface ScanResult { scanRef: string; nibssMatchId: string; nibssLatencyMs: number; latencyWarning: boolean; identityPreview: IdentityPreview; bankDirectory: BankEntry[]; }

export function BihGateway({ onBack }: { onBack: () => void }) {
  const [step, setStep]       = useState<Step>("mode");
  const [txnType, setTxnType] = useState<TxnType>("ACCOUNT_SETUP");
  const [scanRef, setScanRef] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [nibssProgress, setNibssProgress] = useState(0);
  const [scanData, setScanData]   = useState<ScanResult | null>(null);
  const [selectedBank, setSelectedBank]   = useState<BankEntry | null>(null);
  const [accountType, setAccountType]     = useState<"SAVINGS"|"CURRENT">("SAVINGS");
  const [amountInput, setAmountInput]     = useState("");
  const [recipientRef, setRecipientRef]   = useState("");
  const [billerCode, setBillerCode]       = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [result, setResult]       = useState<Record<string, unknown> | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startCountdown = () => {
    setCountdown(60);
    timerRef.current = setInterval(() => setCountdown(c => c !== null && c > 1 ? c - 1 : 0), 1000);
  };

  // Step 0 — prime session
  const handleModeSelect = async (type: TxnType) => {
    setTxnType(type); setError(null); setLoading(true);
    try {
      const res = await fetch(`${API}/v1/bih/scan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionType: type, orgId: "default" }),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Init failed");
      const data = await res.json() as { scanRef: string };
      setScanRef(data.scanRef); setStep("scanning");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // Step 1 — simulate FAP-20 capture + submit template → NIBSS
  const runFingerprintCapture = async () => {
    if (!scanRef) return;
    setStep("scanning"); setScanProgress(0);
    // Simulate FAP-20 sensor capture (0→100% progress over 1.8s)
    const captureInterval = setInterval(() => setScanProgress(p => Math.min(p + 8, 100)), 150);
    await new Promise(r => setTimeout(r, 1800));
    clearInterval(captureInterval); setScanProgress(100);
    setStep("nibss"); setNibssProgress(0);
    // Simulate NIBSS 1:N search progress bar
    const nibssInterval = setInterval(() => setNibssProgress(p => Math.min(p + 5, 95)), 60);
    try {
      const stubTemplate = btoa("stub-minutiae-fap20-iso19794-" + Date.now());
      const res = await fetch(`${API}/v1/bih/${scanRef}/template`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTemplateB64: stubTemplate, sensorDeviceId: "DEV-ARATEK-A600-001", orgId: "default" }),
      });
      clearInterval(nibssInterval); setNibssProgress(100);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "NIBSS match failed");
      const data = await res.json() as ScanResult;
      setScanData(data); setStep("identity");
    } catch (e) { clearInterval(nibssInterval); setError(String(e)); setStep("mode"); }
  };

  // Step 2a — ACCOUNT_SETUP provision
  const handleProvision = async () => {
    if (!selectedBank || !scanRef) return;
    setLoading(true); setError(null); startCountdown();
    try {
      const res = await fetch(`${API}/v1/bih/${scanRef}/provision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode: selectedBank.code, accountType, orgId: "default" }),
      });
      if (timerRef.current) { clearInterval(timerRef.current); }
      setCountdown(null);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Provision failed");
      setResult(await res.json() as Record<string, unknown>); setStep("result");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // Step 2b — Gate operations (Withdrawal / Transfer / Bill)
  const handleGate = async () => {
    if (!scanRef) return;
    setLoading(true); setError(null);
    const body: Record<string, unknown> = { orgId: "default" };
    if (amountInput) body.amountMinor = Math.round(parseFloat(amountInput) * 100);
    if (recipientRef) body.recipientRef = recipientRef;
    if (billerCode) body.billerCode = billerCode;
    try {
      const res = await fetch(`${API}/v1/bih/${scanRef}/gate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Gate failed");
      setResult(await res.json() as Record<string, unknown>); setStep("result");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "2rem" }}>← Back</button>
      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ══ RESULT ════════════════════════════════════════════════════════ */}
      {step === "result" && result && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
            {result.authorized === false ? "❌" : "✅"}
          </div>
          <h2 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>
            {txnType === "ACCOUNT_SETUP" ? "Account Created" : `${txnType.replace("_"," ")} Authorized`}
          </h2>
          <div className="panel--gold" style={{ textAlign: "left", margin: "2rem 0" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>Result</p>
            {txnType === "ACCOUNT_SETUP" && (
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <p className="text-xs dim" style={{ marginBottom: "0.4rem" }}>Account Number</p>
                <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: "1.8rem", color: "var(--gold-bright)", letterSpacing: "0.15em" }}>
                  {String(result.accountNumber ?? "—")}
                </p>
              </div>
            )}
            {([
              ["NIBSS Match ID",    result.nibssMatchId],
              ["Bank",             result.bankName ?? (result.operation as Record<string,unknown>)?.["type"]],
              ["Account Type",     result.accountType],
              ["Elapsed",          result.elapsedMs ? `${String(result.elapsedMs)}ms` : undefined],
              ["60s Mandate",      result.mandateMet !== undefined ? (result.mandateMet ? "✓ Met" : "✗ Breached") : undefined],
              ["Zero-Input",       result.zeroInputCompliant ? "✓ Enforced" : undefined],
            ] as [string, unknown][]).filter(([,v]) => v !== undefined && v !== null).map(([k,v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs dim">{k}</span>
                <span style={{ fontSize: "0.85rem", fontWeight: 600,
                  color: k === "Zero-Input" || k === "60s Mandate" ? "var(--ok)" : "var(--text)" }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn--gold btn--full" onClick={() => { setStep("mode"); setResult(null); setScanData(null); setSelectedBank(null); }}>
            ← New Transaction
          </button>
        </div>
      )}

      {/* ══ OPERATION INPUT (WITHDRAWAL / TRANSFER / BILL) ════════════════ */}
      {step === "operation" && scanData && (
        <div>
          <p className="panel-title" style={{ marginBottom: "0.5rem" }}>Step 2 — {txnType.replace("_"," ")}</p>
          <h2 className="serif" style={{ marginBottom: "0.25rem" }}>Authorize Operation</h2>
          <div className="notice notice--ok" style={{ marginBottom: "1.5rem" }}>
            <span>✓</span>
            <span style={{ fontSize: "0.82rem" }}>NIBSS Match Confirmed — {scanData.identityPreview.fullName} · {scanData.nibssLatencyMs}ms</span>
          </div>
          <div className="panel--gold" style={{ marginBottom: "1.5rem" }}>
            <div className="form-group">
              <label className="form-label">Amount (₦) <span>*</span></label>
              <input className="form-input" type="number" min="0" step="0.01" value={amountInput}
                onChange={e => setAmountInput(e.target.value)} placeholder="5000.00" />
            </div>
            {txnType === "TRANSFER" && (
              <div className="form-group">
                <label className="form-label">Recipient Account (NUBAN) <span>*</span></label>
                <input className="form-input" value={recipientRef} onChange={e => setRecipientRef(e.target.value)} placeholder="0123456789" />
              </div>
            )}
            {txnType === "BILL_PAYMENT" && (
              <div className="form-group">
                <label className="form-label">Biller Code <span>*</span></label>
                <input className="form-input" value={billerCode} onChange={e => setBillerCode(e.target.value)} placeholder="EKEDC-PREPAID" />
              </div>
            )}
            <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleGate()} disabled={loading || !amountInput}>
              {loading ? <><span className="spin">⏳</span> Authorizing…</> : "Authorize with Fingerprint ✓ →"}
            </button>
          </div>
        </div>
      )}

      {/* ══ IDENTITY CARD + BANK GRID (ACCOUNT_SETUP) / AUTH CONFIRM ═══════ */}
      {step === "identity" && scanData && (
        <div>
          <div className="flex justify-between items-center" style={{ marginBottom: "1.5rem" }}>
            <div>
              <p className="panel-title" style={{ marginBottom: "0.25rem" }}>NIBSS Identity Unlocked</p>
              <h2 className="serif">{txnType === "ACCOUNT_SETUP" ? "Step 2 — Select Bank" : "Fingerprint Authorized"}</h2>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className={`badge ${scanData.latencyWarning ? "badge--bad" : "badge--ok"}`}>
                {scanData.latencyWarning ? "⚠" : "●"} {scanData.nibssLatencyMs}ms
              </span>
              <p className="text-xs dim" style={{ marginTop: "0.25rem" }}>NIBSS latency</p>
            </div>
          </div>

          {/* Read-only identity card — ZERO INPUT RULE enforced */}
          <div className="panel--gold" style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.75rem" }}>
              NIBSS Verified Identity
              <span className="badge badge--ok" style={{ marginLeft: "0.75rem", fontSize: "0.6rem" }}>Zero-Input</span>
            </p>
            <div className="notice notice--info" style={{ marginBottom: "1rem" }}>
              <span>🔒</span>
              <span style={{ fontSize: "0.78rem" }}>Fields below are sourced exclusively from NIBSS. No manual input is accepted. This is the Absolute Source of Truth.</span>
            </div>
            <div className="form-grid">
              {[
                ["Full Name",       scanData.identityPreview.fullName],
                ["Date of Birth",   scanData.identityPreview.dateOfBirth],
                ["Gender",          scanData.identityPreview.gender === "M" ? "Male" : "Female"],
                ["State of Origin", scanData.identityPreview.stateOfOrigin],
                ["Address",         scanData.identityPreview.addressSummary + "…"],
                ["NIBSS Match ID",  scanData.nibssMatchId?.slice(0,26) + "…"],
              ].map(([k,v]) => (
                <div key={k} style={{ padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
                  <p className="text-xs dim" style={{ marginBottom: "0.15rem" }}>{k}</p>
                  <p style={{ fontSize: "0.88rem", color: "var(--text)", fontWeight: 500, fontStyle: k === "Full Name" ? "normal" : "normal" }}>{v}</p>
                </div>
              ))}
            </div>
          </div>

          {txnType !== "ACCOUNT_SETUP" ? (
            <button className="btn btn--gold btn--lg btn--full" onClick={() => setStep("operation")}>
              Proceed to {txnType.replace("_"," ")} →
            </button>
          ) : (
            <>
              <div className="panel" style={{ marginBottom: "1.25rem" }}>
                <p className="panel-title" style={{ marginBottom: "0.75rem" }}>Account Type</p>
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
              <div className="panel" style={{ marginBottom: "1.5rem" }}>
                <p className="panel-title" style={{ marginBottom: "1rem" }}>Select Bank — National Bank Grid</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: "0.6rem" }}>
                  {scanData.bankDirectory.map(b => (
                    <div key={b.code} onClick={() => setSelectedBank(b)} style={{
                      padding: "0.7rem 0.9rem", borderRadius: "var(--radius-sm)", cursor: "pointer",
                      border: selectedBank?.code === b.code ? "1px solid var(--gold)" : "1px solid var(--border)",
                      background: selectedBank?.code === b.code ? "var(--gold-glow)" : "var(--bg-surface)",
                      transition: "all 0.2s",
                    }}>
                      <div className="flex justify-between">
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: selectedBank?.code === b.code ? "var(--gold-bright)" : "var(--text)" }}>{b.shortName}</span>
                        <span className="badge badge--dim" style={{ fontSize: "0.58rem" }}>{b.country}</span>
                      </div>
                      <p className="text-xs dim" style={{ marginTop: "0.2rem" }}>Tier {b.tier}</p>
                    </div>
                  ))}
                </div>
              </div>
              {countdown !== null && countdown > 0 && (
                <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", margin: "0 auto 0.75rem",
                    background: `conic-gradient(var(--gold) ${(countdown/60)*360}deg,rgba(255,255,255,0.05) 0)`,
                    display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <div style={{ width: 66, height: 66, borderRadius: "50%", background: "var(--bg-panel)", position: "absolute",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="mono" style={{ color: "var(--gold-bright)", fontSize: "1.2rem" }}>{countdown}s</span>
                    </div>
                  </div>
                  <p className="muted text-sm">Provisioning account with CBS…</p>
                </div>
              )}
              <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleProvision()} disabled={loading || !selectedBank}>
                {loading ? <><span className="spin">⏳</span> Provisioning…</> : `Mint Account — ${selectedBank?.name ?? "Select bank"} →`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ══ NIBSS SEARCH ANIMATION ═════════════════════════════════════════ */}
      {step === "nibss" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>🌐</div>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>NIBSS 1:N Search</h3>
          <p className="muted" style={{ marginBottom: "2rem", fontSize: "0.88rem" }}>
            Searching national BVN registry… AES-256-GCM encrypted minutiae in transit.
          </p>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
            <div style={{ height: "100%", width: `${nibssProgress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold-bright))", transition: "width 0.1s linear", borderRadius: 999 }} />
          </div>
          <p className="text-xs dim">{nibssProgress}% — target: sub-3 seconds</p>
        </div>
      )}

      {/* ══ FAP-20 SCAN ANIMATION ══════════════════════════════════════════ */}
      {step === "scanning" && !scanRef && <p className="muted text-sm">Priming session…</p>}
      {step === "scanning" && scanRef && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{
            width: 140, height: 140, borderRadius: "50%", margin: "0 auto 2rem",
            border: `6px solid transparent`,
            borderTopColor: "var(--gold)", borderLeftColor: "var(--gold-dim)",
            animation: "spin 1.2s linear infinite",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "radial-gradient(circle,rgba(201,168,76,0.08),transparent)",
            position: "relative",
          }}>
            <span style={{ fontSize: "3.5rem", animation: "pulse 1.5s ease-in-out infinite" }}>☞</span>
          </div>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>Place Finger on FAP-20 Sensor</h3>
          <p className="muted" style={{ marginBottom: "1.5rem", fontSize: "0.88rem" }}>
            Capturing ISO 19794-2 WSQ minutiae at 500 DPI…
          </p>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
            <div style={{ height: "100%", width: `${scanProgress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold))", transition: "width 0.15s ease", borderRadius: 999 }} />
          </div>
          {scanProgress < 100
            ? <p className="text-xs dim">Scanning… {scanProgress}%</p>
            : (
              <button className="btn btn--gold btn--lg" onClick={() => void runFingerprintCapture()}>
                Submit to NIBSS →
              </button>
            )
          }
          {scanProgress === 0 && (
            <button className="btn btn--gold btn--lg" style={{ marginTop: "1rem" }} onClick={() => void runFingerprintCapture()}>
              Begin FAP-20 Capture →
            </button>
          )}
        </div>
      )}

      {/* ══ MODE SELECT ═══════════════════════════════════════════════════ */}
      {step === "mode" && (
        <div>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>☞</div>
            <p className="panel-title" style={{ marginBottom: "0.5rem" }}>BIH — Biometric Identity Harvest</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Fingerprint is the Universal Key</h2>
            <p className="muted" style={{ fontSize: "0.9rem", maxWidth: 460, margin: "0 auto" }}>
              One fingerprint scan unlocks your national identity from the NIBSS registry.
              Account Setup, Withdrawal, Transfer, and Bill Payment — all authorized by your fingerprint alone.
            </p>
          </div>
          <div className="grid-2" style={{ marginBottom: "1.5rem" }}>
            {([
              { type: "ACCOUNT_SETUP", icon: "🏦", label: "Account Setup", desc: "Zero-input onboarding — NIBSS identity is the only data source" },
              { type: "WITHDRAWAL",    icon: "💵", label: "Withdrawal",    desc: "Fingerprint + amount → funds released at agent POS" },
              { type: "TRANSFER",      icon: "⚡", label: "Transfer",      desc: "Fingerprint + recipient + amount → NIBSS NIP gateway" },
              { type: "BILL_PAYMENT",  icon: "🧾", label: "Bill Payment",  desc: "Fingerprint + biller + amount → NIBSS eBillsPay" },
            ] as { type: TxnType; icon: string; label: string; desc: string }[]).map(m => (
              <div key={m.type} className="pillar-card" style={{ cursor: "pointer" }}
                onClick={() => void handleModeSelect(m.type)}>
                <span className="pillar-icon">{m.icon}</span>
                <h3 style={{ marginBottom: "0.5rem" }}>{m.label}</h3>
                <p>{m.desc}</p>
              </div>
            ))}
          </div>
          <div className="notice notice--info">
            <span>🔒</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>Security:</strong> Your fingerprint minutiae are encrypted AES-256-GCM before reaching NIBSS.
              The template is purged immediately after the match response. Only the SHA-256 hash is retained for audit.
              Sub-3-second 1:N national registry search.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

