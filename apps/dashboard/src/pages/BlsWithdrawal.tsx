import { useState, useEffect, useRef } from "react";

const API = "/api";
type Step = "intro" | "scan1" | "nibss1" | "accounts" | "confirm" | "scan2" | "nibss2" | "result";

interface AccountMasked {
  accountRef: string; bankCode: string; bankName: string; bankShortName: string;
  accountType: string; balanceMinor: number; balanceDisplay: string; currency: string; tier: number;
}
interface DiscoverResult {
  sessionRef: string; sessionToken: string; discoveryScanId: string;
  discoveryLatencyMs: number; latencyWarning: boolean;
  identityPreview: { fullName: string; stateOfOrigin: string };
  accounts: AccountMasked[];
}
interface SelectResult {
  sessionRef: string; status: string;
  confirmation: { prompt: string; bank: string; accountRef: string; amountNaira: string };
}
interface SealResult {
  discoveryScanId: string; finalAuthScanId: string; crossValidationPassed: boolean;
  executionRef: string; authorized: boolean; operation: Record<string, unknown>;
  zeroKnowledgeCompliance: { accountMapWipedAt: string; templateDataPurgedAt: string };
  message: string;
}

export function BlsWithdrawal({ onBack }: { onBack: () => void }) {
  const [step, setStep]               = useState<Step>("intro");
  const [sessionRef, setSessionRef]   = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [scan1Progress, setScan1Progress] = useState(0);
  const [nibss1Progress, setNibss1Progress] = useState(0);
  const [scan2Progress, setScan2Progress] = useState(0);
  const [nibss2Progress, setNibss2Progress] = useState(0);
  const [discover, setDiscover]       = useState<DiscoverResult | null>(null);
  const [accounts, setAccounts]       = useState<AccountMasked[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountMasked | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [confirmation, setConfirmation] = useState<SelectResult["confirmation"] | null>(null);
  const [sealResult, setSealResult]   = useState<SealResult | null>(null);
  const [idleCountdown, setIdleCountdown] = useState<number | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const idleRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { [idleRef, progressRef].forEach(r => r.current && clearInterval(r.current)); }, []);

  const startIdle = () => {
    if (idleRef.current) clearInterval(idleRef.current);
    setIdleCountdown(60);
    idleRef.current = setInterval(() => setIdleCountdown(c => c !== null && c > 1 ? c - 1 : 0), 1000);
  };

  // ── Step 0: Initiate ──────────────────────────────────────────────────────
  const handleInitiate = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/v1/bls/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: "default" }),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Init failed");
      const data = await res.json() as { sessionRef: string; sessionToken: string };
      setSessionRef(data.sessionRef); setSessionToken(data.sessionToken);
      startIdle(); setStep("scan1");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // ── Step 1: Discovery Scan ────────────────────────────────────────────────
  const runDiscoveryScan = async () => {
    if (!sessionRef || !sessionToken) return;
    // Simulate FAP-20 capture progress (0→100%)
    setScan1Progress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => setScan1Progress(p => p < 100 ? p + 7 : 100), 120);
    await new Promise(r => setTimeout(r, 1600));
    clearInterval(progressRef.current!); setScan1Progress(100);

    setStep("nibss1"); setNibss1Progress(0);
    progressRef.current = setInterval(() => setNibss1Progress(p => Math.min(p + 5, 92)), 60);
    setLoading(true); setError(null);
    try {
      const stub = btoa("discovery-minutiae-fap20-" + Date.now());
      const res  = await fetch(`${API}/v1/bls/${sessionRef}/discover`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTemplateB64: stub, sessionToken, sensorDeviceId: "DEV-ARATEK-A600-001", orgId: "default" }),
      });
      clearInterval(progressRef.current!); setNibss1Progress(100);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Discovery failed");
      const data = await res.json() as DiscoverResult;
      setDiscover(data); setAccounts(data.accounts); startIdle(); setStep("accounts");
    } catch (e) { clearInterval(progressRef.current!); setError(String(e)); setStep("scan1"); }
    finally { setLoading(false); }
  };

  // ── Step 2: Select account + amount ──────────────────────────────────────
  const handleSelect = async () => {
    if (!selectedAccount || !amountInput || !sessionRef || !sessionToken) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/v1/bls/${sessionRef}/select`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAccountRef: selectedAccount.accountRef,
          amountMinor: Math.round(parseFloat(amountInput) * 100), sessionToken, orgId: "default" }),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Selection failed");
      const data = await res.json() as SelectResult;
      setConfirmation(data.confirmation); startIdle(); setStep("confirm");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // ── Step 3: Seal Scan (Second Fingerprint) ────────────────────────────────
  const runSealScan = async () => {
    if (!sessionRef || !sessionToken) return;
    setScan2Progress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => setScan2Progress(p => p < 100 ? p + 7 : 100), 130);
    await new Promise(r => setTimeout(r, 1700));
    clearInterval(progressRef.current!); setScan2Progress(100);

    setStep("nibss2"); setNibss2Progress(0);
    progressRef.current = setInterval(() => setNibss2Progress(p => Math.min(p + 5, 92)), 60);
    setLoading(true); setError(null);
    try {
      const stub = btoa("seal-minutiae-fap20-" + Date.now());
      const res  = await fetch(`${API}/v1/bls/${sessionRef}/seal`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTemplateB64: stub, sessionToken, sensorDeviceId: "DEV-ARATEK-A600-001", orgId: "default" }),
      });
      clearInterval(progressRef.current!); setNibss2Progress(100);
      if (idleRef.current) clearInterval(idleRef.current); setIdleCountdown(null);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Seal failed");
      setSealResult(await res.json() as SealResult); setStep("result");
    } catch (e) { clearInterval(progressRef.current!); setError(String(e)); setStep("confirm"); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep("intro"); setSessionRef(null); setSessionToken(null); setDiscover(null);
    setAccounts([]); setSelectedAccount(null); setAmountInput(""); setConfirmation(null);
    setSealResult(null); setError(null); setIdleCountdown(null);
    if (idleRef.current) clearInterval(idleRef.current);
  };

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← Back</button>
        <div className="flex gap-1 items-center">
          {idleCountdown !== null && idleCountdown > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: `conic-gradient(${idleCountdown < 15 ? "var(--bad)" : "var(--gold)"} ${(idleCountdown/60)*360}deg, rgba(255,255,255,0.05) 0)`,
                display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
              }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--bg-panel)", position: "absolute",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "0.55rem", fontFamily: '"JetBrains Mono",monospace', color: idleCountdown < 15 ? "var(--bad)" : "var(--gold)" }}>{idleCountdown}</span>
                </div>
              </div>
              <span className="text-xs dim">idle</span>
            </div>
          )}
          {sessionRef && <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>BLS •••{sessionRef.slice(-6)}</span>}
        </div>
      </div>

      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ════════════════════ RESULT ═══════════════════════════════════════ */}
      {step === "result" && sealResult && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{sealResult.authorized ? "✅" : "❌"}</div>
          <h2 className="serif" style={{ color: "var(--gold-bright)", marginBottom: "0.5rem" }}>
            {sealResult.authorized ? "Withdrawal Authorized" : "Execution Failed"}
          </h2>
          <div className="panel--gold" style={{ textAlign: "left", margin: "2rem 0" }}>
            <p className="panel-title" style={{ marginBottom: "1rem" }}>Execution Receipt</p>
            {([
              ["Execution Ref",        sealResult.executionRef],
              ["Discovery Scan ID",    sealResult.discoveryScanId],
              ["Final Auth Scan ID",   sealResult.finalAuthScanId],
              ["Cross-Validation",     sealResult.crossValidationPassed ? "✓ Passed" : "✗ Failed"],
              ["Account Map Wiped",    new Date(sealResult.zeroKnowledgeCompliance.accountMapWipedAt).toLocaleTimeString()],
              ["Template Purged",      new Date(sealResult.zeroKnowledgeCompliance.templateDataPurgedAt).toLocaleTimeString()],
            ] as [string, string][]).map(([k,v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs dim">{k}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, fontFamily: k.includes("ID") || k.includes("Ref") ? '"JetBrains Mono",monospace' : undefined,
                  color: k === "Cross-Validation" || k.includes("Wiped") || k.includes("Purged") ? "var(--ok)" : "var(--text)" }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="notice notice--ok" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>🔒</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>Zero-Knowledge Storage:</strong> Account map and biometric session data wiped immediately after execution.
              Only audit log entries (Scan IDs + Bank Code) are retained.
            </div>
          </div>
          <button className="btn btn--gold btn--full" onClick={reset}>← New Transaction</button>
        </div>
      )}

      {/* ════════════════════ SEAL SCAN (NIBSS) ════════════════════════════ */}
      {step === "nibss2" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>🔐</div>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>Final Authorization Seal</h3>
          <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.88rem" }}>
            Cross-validating Seal Scan against Discovery bvnAnchorHash…
          </p>
          <p className="text-xs dim" style={{ marginBottom: "2rem" }}>Ghost-transaction prevention — same individual, two distinct NIBSS events</p>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
            <div style={{ height: "100%", width: `${nibss2Progress}%`, background: "linear-gradient(90deg,#4CAF50,#81C784)", transition: "width 0.1s linear", borderRadius: 999 }} />
          </div>
          <p className="text-xs dim">{nibss2Progress}% validated</p>
        </div>
      )}

      {/* ════════════════════ SEAL SCAN (FAP-20) ═══════════════════════════ */}
      {step === "scan2" && (
        <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <p className="panel-title" style={{ marginBottom: "0.5rem", color: "var(--ok)" }}>Final Authorization — Scan #2</p>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>Place Finger Again to Seal</h3>
          <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.85rem" }}>
            {confirmation?.prompt}
          </p>
          <p className="text-xs dim" style={{ marginBottom: "2rem" }}>This second scan prevents ghost transactions. A new NIBSS event ID will be generated.</p>
          <div style={{
            width: 140, height: 140, borderRadius: "50%", margin: "0 auto 2rem",
            border: "6px solid transparent", borderTopColor: "#4CAF50", borderLeftColor: "rgba(76,175,80,0.4)",
            animation: scan2Progress > 0 && scan2Progress < 100 ? "spin 1.2s linear infinite" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "radial-gradient(circle,rgba(76,175,80,0.08),transparent)",
          }}>
            <span style={{ fontSize: "3.5rem" }}>☞</span>
          </div>
          {scan2Progress > 0 && scan2Progress < 100 && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
              <div style={{ height: "100%", width: `${scan2Progress}%`, background: "linear-gradient(90deg,rgba(76,175,80,0.6),#4CAF50)", transition: "width 0.13s ease", borderRadius: 999 }} />
            </div>
          )}
          <button className="btn btn--full" style={{ background: "linear-gradient(135deg,#388E3C,#4CAF50)", color: "#fff", padding: "0.9rem", borderRadius: "var(--radius)", fontWeight: 700 }}
            onClick={() => void runSealScan()} disabled={loading || scan2Progress > 0}>
            {scan2Progress > 0 && scan2Progress < 100 ? `Capturing… ${scan2Progress}%` : "Perform Final Authorization Scan →"}
          </button>
        </div>
      )}

      {/* ════════════════════ CONFIRM ══════════════════════════════════════ */}
      {step === "confirm" && confirmation && (
        <div>
          <p className="panel-title" style={{ marginBottom: "0.5rem" }}>Step 3 of 4 — Confirm & Seal</p>
          <h2 className="serif" style={{ marginBottom: "1.5rem" }}>Final Confirmation</h2>
          <div style={{
            background: "linear-gradient(135deg,rgba(76,175,80,0.08),rgba(201,168,76,0.04))",
            border: "1px solid rgba(76,175,80,0.35)", borderRadius: "var(--radius)", padding: "2rem", marginBottom: "1.5rem", textAlign: "center",
          }}>
            <p style={{ fontSize: "1.1rem", color: "var(--text-dim)", marginBottom: "0.75rem" }}>Withdrawal Request</p>
            <p style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--gold-bright)", marginBottom: "0.5rem" }}>
              {confirmation.amountNaira}
            </p>
            <p style={{ fontSize: "1rem", color: "var(--text)" }}>from <strong>{confirmation.bank}</strong></p>
            <p className="text-xs dim" style={{ marginTop: "0.4rem" }}>{confirmation.accountRef}</p>
          </div>
          <div className="notice notice--info" style={{ marginBottom: "1.5rem" }}>
            <span>🔒</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>Two-Step Biometric Seal:</strong> A second fingerprint scan is required to execute this withdrawal.
              This is a distinct NIBSS event — the Final_Authorization_Scan_ID will be logged separately from the Discovery_Scan_ID.
            </div>
          </div>
          <button className="btn btn--full btn--lg" style={{ background: "linear-gradient(135deg,#388E3C,#4CAF50)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 700 }}
            onClick={() => setStep("scan2")}>
            Proceed to Final Authorization Scan →
          </button>
        </div>
      )}

      {/* ════════════════════ ACCOUNTS ═════════════════════════════════════ */}
      {step === "accounts" && discover && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.25rem" }}>Step 2 of 4 — Account Selection</p>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>Your National Financial Footprint</h2>
            <div className="flex gap-1 items-center">
              <span className={`badge ${discover.latencyWarning ? "badge--bad" : "badge--ok"}`}>
                {discover.discoveryLatencyMs}ms
              </span>
              <span className="text-xs dim">NIBSS 1:N · {accounts.length} accounts · {discover.identityPreview.fullName}</span>
            </div>
          </div>

          {/* Account cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {accounts.map(a => (
              <div key={a.accountRef} onClick={() => setSelectedAccount(a)} style={{
                padding: "1rem 1.25rem", borderRadius: "var(--radius)", cursor: "pointer",
                border: selectedAccount?.accountRef === a.accountRef ? "1px solid var(--gold)" : "1px solid var(--border)",
                background: selectedAccount?.accountRef === a.accountRef ? "var(--gold-glow)" : "var(--bg-panel)",
                transition: "all 0.18s", display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.25rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "1rem", color: selectedAccount?.accountRef === a.accountRef ? "var(--gold-bright)" : "var(--text)" }}>
                      {a.bankShortName}
                    </span>
                    <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{a.accountType}</span>
                    <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>Tier {a.tier}</span>
                  </div>
                  <p className="mono" style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>{a.accountRef}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ok)" }}>{a.balanceDisplay}</p>
                  <p className="text-xs dim">{a.currency}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Amount input */}
          {selectedAccount && (
            <div className="panel--gold" style={{ marginBottom: "1.5rem" }}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Withdrawal Amount (₦) <span>*</span></label>
                <input className="form-input" type="number" min="0.01" step="0.01" value={amountInput}
                  onChange={e => setAmountInput(e.target.value)} placeholder="5,000.00"
                  style={{ fontSize: "1.2rem" }} />
                <p className="form-hint">Max: {selectedAccount.balanceDisplay} · Enter amount in Naira</p>
              </div>
              <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleSelect()} disabled={loading || !amountInput}>
                {loading ? <><span className="spin">⏳</span> Confirming…</> : `Confirm — ${selectedAccount.bankShortName} ${selectedAccount.accountRef} →`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ NIBSS DISCOVERY ANIMATION ════════════════════ */}
      {step === "nibss1" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>🌐</div>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>NIBSS 1:N Discovery Ping</h3>
          <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.88rem" }}>
            Searching national BVN registry… mapping all linked financial institutions.
          </p>
          <p className="text-xs dim" style={{ marginBottom: "2rem" }}>AES-256-GCM encrypted minutiae in transit · Account Mapping Feed loading</p>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
            <div style={{ height: "100%", width: `${nibss1Progress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold-bright))", transition: "width 0.1s linear", borderRadius: 999 }} />
          </div>
          <p className="text-xs dim">{nibss1Progress}% — Account Mapping Feed</p>
        </div>
      )}

      {/* ════════════════════ DISCOVERY SCAN (FAP-20) ══════════════════════ */}
      {step === "scan1" && (
        <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
          <p className="panel-title" style={{ marginBottom: "0.5rem" }}>Step 1 of 4 — Discovery Scan</p>
          <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Place Finger on FAP-20 Sensor</h2>
          <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "2rem" }}>
            One fingerprint scan discovers your entire national financial footprint — all banks, all balances.
          </p>
          <div style={{
            width: 140, height: 140, borderRadius: "50%", margin: "0 auto 2rem",
            border: `6px solid transparent`, borderTopColor: "var(--gold)", borderLeftColor: "var(--gold-dim)",
            animation: scan1Progress > 0 && scan1Progress < 100 ? "spin 1.2s linear infinite" : "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "radial-gradient(circle,rgba(201,168,76,0.08),transparent)",
          }}>
            <span style={{ fontSize: "3.5rem" }}>☞</span>
          </div>
          {scan1Progress > 0 && scan1Progress < 100 && (
            <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
              <div style={{ height: "100%", width: `${scan1Progress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold))", transition: "width 0.12s ease", borderRadius: 999 }} />
            </div>
          )}
          <button className="btn btn--gold btn--lg btn--full" onClick={() => void runDiscoveryScan()} disabled={loading || (scan1Progress > 0 && scan1Progress < 100)}>
            {scan1Progress > 0 && scan1Progress < 100 ? `Capturing… ${scan1Progress}%` : "Begin Discovery Scan →"}
          </button>
        </div>
      )}

      {/* ════════════════════ INTRO ════════════════════════════════════════ */}
      {step === "intro" && (
        <div>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🔍</div>
            <p className="panel-title" style={{ marginBottom: "0.75rem" }}>BLS-TSA — Biometric Liquidity Sweep</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Scan-to-Discover Withdrawal</h2>
            <p className="muted" style={{ fontSize: "0.9rem", maxWidth: 480, margin: "0 auto" }}>
              One fingerprint scan discovers your entire national financial footprint across every bank.
              A second scan seals the withdrawal — preventing ghost transactions.
            </p>
          </div>

          {/* Protocol steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2.5rem" }}>
            {[
              { n:"1", icon:"☞", title:"Discovery Scan", desc:"FAP-20 minutiae → NIBSS 1:N → all linked accounts discovered with real-time balances. Template purged immediately." },
              { n:"2", icon:"🏦", title:"Account Selection",desc:"Choose source bank + enter withdrawal amount. Balance validated inside encrypted blob." },
              { n:"3", icon:"🔐", title:"Biometric Seal",   desc:"Second fingerprint scan — a distinct NIBSS event. Cross-validates Discovery_Scan_ID → Final_Auth_Scan_ID." },
              { n:"4", icon:"✅", title:"Execution + Wipe", desc:"Withdrawal executed. Account map zero-wiped. Session token invalidated. Audit log retained." },
            ].map(s => (
              <div key={s.n} style={{ display: "flex", gap: "1rem", alignItems: "flex-start", padding: "1rem", background: "var(--bg-panel)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,var(--gold),#8A6F32)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", fontWeight: 700, color: "#0C0C10", flexShrink: 0 }}>{s.n}</div>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: "0.2rem" }}>{s.icon} {s.title}</p>
                  <p className="text-xs dim">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="notice notice--info" style={{ marginBottom: "1.5rem" }}>
            <span>⏱</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>60-second idle timer</strong> — visible throughout the session. Any inactivity past 60 seconds
              permanently invalidates the session token. Zero-knowledge storage: account numbers and balances are never
              logged; encrypted map is wiped immediately after execution.
            </div>
          </div>

          <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleInitiate()} disabled={loading}>
            {loading ? <><span className="spin">⏳</span> Initializing…</> : "Begin Biometric Liquidity Sweep →"}
          </button>
        </div>
      )}
    </div>
  );
}

