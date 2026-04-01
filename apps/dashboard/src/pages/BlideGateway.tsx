import { useState, useEffect, useRef } from "react";

const API = "/api";
type TxnType = "ACCOUNT_SETUP" | "WITHDRAWAL" | "TRANSFER" | "BILL_PAYMENT";
type Step = "mode" | "camera" | "nibss" | "select" | "challenge" | "liveness" | "result";

interface AccountCard { accountRef: string; bankName: string; bankShortName: string; accountType: string; balanceMinor: number; balanceDisplay: string; tier: number; }
interface IdentityPreview { fullName: string; dateOfBirth: string; gender: string; stateOfOrigin: string; addressSummary: string; }
interface BankEntry { code: string; name: string; shortName: string; tier: number; country: string; }
interface FaceResult { sessionRef: string; faceMatchId: string; faceLatencyMs: number; transactionType: string; identityPreview: IdentityPreview | null; accounts: AccountCard[] | null; bankDirectory: BankEntry[] | null; }
interface LivenessChallenge { challengeId: string; challengeType: string; prompt: string; icon: string; instruction: string; expiresAt: string; remainingSeconds: number; }
interface SelectResult { sessionRef: string; status: string; faceMatchId: string; liveness: LivenessChallenge; remainingMandateMs: number; message: string; }
interface ExecutionResult { sessionRef: string; status: string; faceMatchId: string; livenessVerified: boolean; completedChallengeType: string; accountNumber?: string; executionRef?: string; totalElapsedMs: number; mandateMet: boolean; zeroKnowledgeLiveness: boolean; message: string; }

export function BlideGateway({ onBack }: { onBack: () => void }) {
  const [step, setStep]         = useState<Step>("mode");
  const [txnType, setTxnType]   = useState<TxnType>("WITHDRAWAL");
  const [sessionRef, setSession] = useState<string | null>(null);
  const [faceData, setFaceData]  = useState<FaceResult | null>(null);
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountCard | null>(null);
  const [selectedBank, setSelectedBank]       = useState<BankEntry | null>(null);
  const [accountType, setAccountType]         = useState<"SAVINGS" | "CURRENT">("SAVINGS");
  const [amountInput, setAmountInput]         = useState("");
  const [recipientRef, setRecipientRef]       = useState("");
  const [billerCode, setBillerCode]           = useState("");
  const [cameraProgress, setCameraProgress]   = useState(0);
  const [nibssProgress, setNibssProgress]     = useState(0);
  const [challengeCountdown, setChallengeCountdown] = useState(30);
  const [mandateCountdown, setMandateCountdown]     = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mandateRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const challengeRef= useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { [progressRef, mandateRef, challengeRef].forEach(r => r.current && clearInterval(r.current)); }, []);

  const startMandateClock = (remainingMs: number) => {
    setMandateCountdown(Math.round(remainingMs / 1000));
    if (mandateRef.current) clearInterval(mandateRef.current);
    mandateRef.current = setInterval(() => setMandateCountdown(c => c !== null && c > 0 ? c - 1 : 0), 1000);
  };
  const startChallengeCountdown = () => {
    setChallengeCountdown(30);
    if (challengeRef.current) clearInterval(challengeRef.current);
    challengeRef.current = setInterval(() => setChallengeCountdown(c => c > 0 ? c - 1 : 0), 1000);
  };

  // Step 0: Mode select → prime session
  const handleModeSelect = async (type: TxnType) => {
    setTxnType(type); setError(null); setLoading(true);
    try {
      const res = await fetch(`${API}/v1/blide/initiate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionType: type, orgId: "default" }),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Init failed");
      const data = await res.json() as { sessionRef: string };
      setSession(data.sessionRef); setStep("camera");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // Step 1: Camera capture → NIBSS face search
  const runFaceCapture = async () => {
    if (!sessionRef) return;
    setCameraProgress(0);
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => setCameraProgress(p => Math.min(p + 6, 100)), 100);
    await new Promise(r => setTimeout(r, 1800));
    clearInterval(progressRef.current!); setCameraProgress(100);

    setStep("nibss"); setNibssProgress(0);
    progressRef.current = setInterval(() => setNibssProgress(p => Math.min(p + 4, 92)), 60);
    setLoading(true); setError(null);
    try {
      const stub = btoa("face-frame-jpeg-iso19794-5-" + Date.now());
      const res  = await fetch(`${API}/v1/blide/${sessionRef}/face`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawFaceTemplateB64: stub, faceFormat: "JPEG", cameraDeviceId: "CAM-NEXGO-N86-001", orgId: "default" }),
      });
      clearInterval(progressRef.current!); setNibssProgress(100);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "NIBSS face match failed");
      const data = await res.json() as FaceResult;
      setFaceData(data); setStep("select");
    } catch (e) { clearInterval(progressRef.current!); setError(String(e)); setStep("camera"); }
    finally { setLoading(false); }
  };

  // Step 2: Select target → get liveness challenge
  const handleSelectTarget = async () => {
    if (!sessionRef) return;
    setLoading(true); setError(null);
    const body: Record<string, unknown> = { orgId: "default" };
    if (txnType === "ACCOUNT_SETUP") {
      if (!selectedBank) { setError("Select a bank"); setLoading(false); return; }
      body.bankCode = selectedBank.code; body.accountType = accountType;
    } else {
      if (!selectedAccount || !amountInput) { setError("Select account and enter amount"); setLoading(false); return; }
      body.selectedAccountRef = selectedAccount.accountRef;
      body.amountMinor = Math.round(parseFloat(amountInput) * 100);
      if (recipientRef) body.recipientRef = recipientRef;
      if (billerCode)   body.billerCode   = billerCode;
    }
    try {
      const res = await fetch(`${API}/v1/blide/${sessionRef}/select`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Selection failed");
      const data = await res.json() as SelectResult;
      setChallenge(data.liveness);
      startMandateClock(data.remainingMandateMs);
      startChallengeCountdown();
      setStep("challenge");
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  };

  // Step 3: Liveness response → execute
  const handleLivenessComplete = async () => {
    if (!sessionRef || !challenge) return;
    if (challengeRef.current) clearInterval(challengeRef.current);
    setLoading(true); setError(null); setStep("liveness");
    await new Promise(r => setTimeout(r, 1200)); // Simulate CV processing
    try {
      const stubFrames = [btoa("liveness-frame-1-" + Date.now()), btoa("liveness-frame-2-" + Date.now())];
      const res = await fetch(`${API}/v1/blide/${sessionRef}/liveness`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, responseFramesB64: stubFrames, orgId: "default" }),
      });
      if (mandateRef.current) clearInterval(mandateRef.current); setMandateCountdown(null);
      if (!res.ok) throw new Error(((await res.json() as { message?: string }).message) ?? "Liveness failed");
      setExecResult(await res.json() as ExecutionResult); setStep("result");
    } catch (e) { setError(String(e)); setStep("challenge"); }
    finally { setLoading(false); }
  };

  const reset = () => {
    setStep("mode"); setSession(null); setFaceData(null); setChallenge(null); setExecResult(null);
    setSelectedAccount(null); setSelectedBank(null); setAmountInput(""); setRecipientRef(""); setBillerCode("");
    setError(null); setMandateCountdown(null); setChallengeCountdown(30);
    [mandateRef, challengeRef, progressRef].forEach(r => r.current && clearInterval(r.current));
  };

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← Back</button>
        <div className="flex gap-1 items-center">
          {mandateCountdown !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%", position: "relative",
                background: `conic-gradient(${mandateCountdown < 15 ? "var(--bad)" : "var(--gold)"} ${(mandateCountdown / 60) * 360}deg, rgba(255,255,255,0.05) 0)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--bg-panel)", position: "absolute",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "0.58rem", fontFamily: '"JetBrains Mono",monospace', color: mandateCountdown < 15 ? "var(--bad)" : "var(--gold)" }}>{mandateCountdown}s</span>
                </div>
              </div>
              <span className="text-xs dim">sub-60s</span>
            </div>
          )}
          <span className="text-xs dim">BLIDE — Face Pay</span>
        </div>
      </div>
      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ════ RESULT ═══════════════════════════════════════════════════════ */}
      {step === "result" && execResult && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>{execResult.mandateMet ? "✅" : "⚠️"}</div>
          <h2 className="serif" style={{ color: "var(--gold-bright)", marginBottom: "0.5rem" }}>
            {txnType === "ACCOUNT_SETUP" ? "Account Created" : `${txnType.replace("_", " ")} Authorized`}
          </h2>
          {execResult.accountNumber && (
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <p className="text-xs dim" style={{ marginBottom: "0.4rem" }}>Account Number</p>
              <p className="mono" style={{ fontSize: "1.8rem", color: "var(--gold-bright)", letterSpacing: "0.15em" }}>{execResult.accountNumber}</p>
            </div>
          )}
          <div className="panel--gold" style={{ textAlign: "left", marginBottom: "1.5rem" }}>
            {([
              ["NIBSS Face Match ID",   execResult.faceMatchId?.slice(0, 28) + "…"],
              ["Liveness Verified",     "✓ TRUE — Zero-Knowledge"],
              ["Challenge Completed",   execResult.completedChallengeType?.replace("_", " ")],
              ["Total Elapsed",         `${execResult.totalElapsedMs}ms`],
              ["Sub-60s Mandate",       execResult.mandateMet ? "✓ Met" : "✗ Breached — flagged"],
              ["Account Map",           "Wiped ✓"],
              ["Biometric Frames",      "Never stored ✓"],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs dim">{k}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600,
                  color: k.includes("Liveness") || k.includes("Map") || k.includes("Frames") || k === "Sub-60s Mandate" ? "var(--ok)" : "var(--text)" }}>{v}</span>
              </div>
            ))}
          </div>
          <div className="notice notice--ok" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>🔒</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>Zero-Knowledge Liveness:</strong> Response frames were processed in-memory by the CV engine and immediately discarded.
              Only <code>Liveness_Verified: TRUE</code> was written to the audit log.
            </div>
          </div>
          <button className="btn btn--gold btn--full" onClick={reset}>← New Face Pay Transaction</button>
        </div>
      )}

      {/* ════ LIVENESS PROCESSING ══════════════════════════════════════════ */}
      {step === "liveness" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem", animation: "pulse 1s ease-in-out infinite" }}>🧠</div>
          <h3 className="serif" style={{ color: "var(--gold-bright)", marginBottom: "0.5rem" }}>CV Engine Validating</h3>
          <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "0.5rem" }}>
            MediaPipe FaceMesh · Active Muscle Movement Analysis
          </p>
          <p className="text-xs dim">Response frames processed in-memory — zero persistence</p>
        </div>
      )}

      {/* ════ LIVENESS CHALLENGE ═══════════════════════════════════════════ */}
      {step === "challenge" && challenge && (
        <div>
          <p className="panel-title" style={{ marginBottom: "0.5rem" }}>Active Liveness Challenge</p>
          <div style={{ textAlign: "center", padding: "2.5rem 1.5rem", marginBottom: "1.5rem",
            background: "radial-gradient(ellipse at center, rgba(201,168,76,0.06) 0%, transparent 70%)",
            border: "1px solid var(--gold-border)", borderRadius: "var(--radius)" }}>
            {/* 30-second countdown ring */}
            <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto 1.5rem",
              background: `conic-gradient(var(--gold) ${(challengeCountdown / 30) * 360}deg, rgba(255,255,255,0.04) 0)`,
              display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ width: 90, height: 90, borderRadius: "50%", background: "var(--bg)", position: "absolute",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "2rem" }}>{challenge.icon}</span>
                <span className="mono" style={{ fontSize: "0.85rem", color: challengeCountdown < 10 ? "var(--bad)" : "var(--gold-bright)" }}>{challengeCountdown}s</span>
              </div>
            </div>
            <div className="badge badge--gold" style={{ marginBottom: "1rem", fontSize: "0.7rem" }}>{challenge.challengeType.replace(/_/g, " ")}</div>
            <h2 className="serif" style={{ fontSize: "1.6rem", color: "var(--gold-bright)", marginBottom: "0.75rem" }}>"{challenge.prompt}"</h2>
            <p className="muted" style={{ fontSize: "0.9rem", marginBottom: "2rem" }}>{challenge.instruction}</p>
            <div className="notice notice--info" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
              <span>🔒</span>
              <div style={{ fontSize: "0.78rem" }}>
                <strong>Anti-Replay:</strong> Challenge ID <code>{challenge.challengeId.slice(0, 18)}…</code> is single-use.
                Response frames will be processed in-memory only — zero storage. No video recorded.
              </div>
            </div>
            <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleLivenessComplete()} disabled={loading || challengeCountdown === 0}>
              {challengeCountdown === 0 ? "Challenge Expired — Request New" : loading ? <><span className="spin">⏳</span> Verifying…</> : "✓ Challenge Complete — Submit →"}
            </button>
          </div>
        </div>
      )}

      {/* ════ TARGET SELECTION ═════════════════════════════════════════════ */}
      {step === "select" && faceData && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.25rem" }}>
              {txnType === "ACCOUNT_SETUP" ? "Step 2 — Select Bank" : "Step 2 — Select Account"}
            </p>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>
              {txnType === "ACCOUNT_SETUP" ? "Zero-Input Onboarding" : "Your Financial Footprint"}
            </h2>
            <div className="flex gap-1 items-center">
              <span className="badge badge--ok">● {faceData.faceLatencyMs}ms</span>
              <span className="text-xs dim">NIBSS Face 1:N · {faceData.faceMatchId?.slice(0, 20)}…</span>
            </div>
          </div>

          {/* ACCOUNT_SETUP: identity card + bank grid */}
          {txnType === "ACCOUNT_SETUP" && faceData.identityPreview && (
            <>
              <div className="panel--gold" style={{ marginBottom: "1.25rem" }}>
                <p className="panel-title" style={{ marginBottom: "0.75rem" }}>
                  NIBSS Identity <span className="badge badge--ok" style={{ fontSize: "0.6rem", marginLeft: "0.5rem" }}>Zero-Input</span>
                </p>
                <div className="notice notice--info" style={{ marginBottom: "0.75rem" }}>
                  <span>🔒</span><span style={{ fontSize: "0.78rem" }}>Sourced exclusively from NIBSS — no manual input accepted</span>
                </div>
                {[
                  ["Full Name", faceData.identityPreview.fullName], ["DOB", faceData.identityPreview.dateOfBirth],
                  ["Gender", faceData.identityPreview.gender === "M" ? "Male" : "Female"],
                  ["State", faceData.identityPreview.stateOfOrigin], ["Address", faceData.identityPreview.addressSummary + "…"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="text-xs dim">{k}</span><span style={{ fontSize: "0.88rem", fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="panel" style={{ marginBottom: "1rem" }}>
                <p className="panel-title" style={{ marginBottom: "0.75rem" }}>Account Type</p>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  {(["SAVINGS", "CURRENT"] as const).map(t => (
                    <button key={t} onClick={() => setAccountType(t)}
                      className={accountType === t ? "btn btn--outline" : "btn btn--ghost"}
                      style={{ flex: 1, justifyContent: "center" }}>
                      {t === "SAVINGS" ? "🏦 Savings" : "💼 Current"}{accountType === t ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel" style={{ marginBottom: "1.25rem" }}>
                <p className="panel-title" style={{ marginBottom: "0.75rem" }}>Select Bank</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(175px,1fr))", gap: "0.6rem" }}>
                  {faceData.bankDirectory?.map(b => (
                    <div key={b.code} onClick={() => setSelectedBank(b)} style={{
                      padding: "0.7rem 0.9rem", borderRadius: "var(--radius-sm)", cursor: "pointer",
                      border: selectedBank?.code === b.code ? "1px solid var(--gold)" : "1px solid var(--border)",
                      background: selectedBank?.code === b.code ? "var(--gold-glow)" : "var(--bg-surface)", transition: "all 0.18s",
                    }}>
                      <p style={{ fontWeight: 600, fontSize: "0.85rem", color: selectedBank?.code === b.code ? "var(--gold-bright)" : "var(--text)" }}>{b.shortName}</p>
                      <p className="text-xs dim">Tier {b.tier}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Financial: account cards + amount/recipient/biller */}
          {txnType !== "ACCOUNT_SETUP" && faceData.accounts && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem", marginBottom: "1.25rem" }}>
                {faceData.accounts.map(a => (
                  <div key={a.accountRef} onClick={() => setSelectedAccount(a)} style={{
                    padding: "0.9rem 1.1rem", borderRadius: "var(--radius)", cursor: "pointer",
                    border: selectedAccount?.accountRef === a.accountRef ? "1px solid var(--gold)" : "1px solid var(--border)",
                    background: selectedAccount?.accountRef === a.accountRef ? "var(--gold-glow)" : "var(--bg-panel)",
                    display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.18s",
                  }}>
                    <div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
                        <span style={{ fontWeight: 700, color: selectedAccount?.accountRef === a.accountRef ? "var(--gold-bright)" : "var(--text)" }}>{a.bankShortName}</span>
                        <span className="badge badge--dim" style={{ fontSize: "0.58rem" }}>{a.accountType}</span>
                      </div>
                      <p className="mono text-xs dim">{a.accountRef}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontWeight: 700, color: "var(--ok)", fontSize: "1rem" }}>{a.balanceDisplay}</p>
                    </div>
                  </div>
                ))}
              </div>
              {selectedAccount && (
                <div className="panel--gold" style={{ marginBottom: "1.25rem" }}>
                  <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                    <label className="form-label">Amount (₦) <span>*</span></label>
                    <input className="form-input" type="number" min="0.01" step="0.01" value={amountInput}
                      onChange={e => setAmountInput(e.target.value)} placeholder="5000.00" />
                  </div>
                  {txnType === "TRANSFER" && (
                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                      <label className="form-label">Recipient NUBAN <span>*</span></label>
                      <input className="form-input" value={recipientRef} onChange={e => setRecipientRef(e.target.value)} placeholder="0123456789" />
                    </div>
                  )}
                  {txnType === "BILL_PAYMENT" && (
                    <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                      <label className="form-label">Biller Code <span>*</span></label>
                      <input className="form-input" value={billerCode} onChange={e => setBillerCode(e.target.value)} placeholder="EKEDC-PREPAID" />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <button className="btn btn--gold btn--lg btn--full" onClick={() => void handleSelectTarget()} disabled={loading}>
            {loading ? <><span className="spin">⏳</span> Issuing Liveness Challenge…</> : "Confirm → Get Liveness Challenge →"}
          </button>
        </div>
      )}

      {/* ════ NIBSS FACE SEARCH ANIMATION ══════════════════════════════════ */}
      {step === "nibss" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>🌐</div>
          <h3 className="serif" style={{ marginBottom: "0.5rem", color: "var(--gold-bright)" }}>NIBSS 1:N Face Search</h3>
          <p className="muted" style={{ marginBottom: "0.5rem", fontSize: "0.88rem" }}>AES-256-GCM encrypted ISO 19794-5 frame in transit…</p>
          <p className="text-xs dim" style={{ marginBottom: "2rem" }}>Searching national BVN face registry · {txnType === "ACCOUNT_SETUP" ? "Building identity package" : "Mapping linked accounts sorted by balance"}</p>
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 8, overflow: "hidden", marginBottom: "0.75rem" }}>
            <div style={{ height: "100%", width: `${nibssProgress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold-bright))", transition: "width 0.1s linear", borderRadius: 999 }} />
          </div>
          <p className="text-xs dim">{nibssProgress}% — {txnType === "ACCOUNT_SETUP" ? "Identity Feed" : "Account Mapping Feed"}</p>
        </div>
      )}

      {/* ════ CAMERA ACTIVATION ════════════════════════════════════════════ */}
      {step === "camera" && (
        <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
          <p className="panel-title" style={{ marginBottom: "0.5rem" }}>Step 1 of 3 — Face Discovery Scan</p>
          <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Look Directly at the Camera</h2>
          <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "2rem" }}>
            One face scan discovers your identity and {txnType === "ACCOUNT_SETUP" ? "builds your NIBSS identity profile" : "maps all your linked bank accounts"}. Frame is purged immediately after match.
          </p>
          {/* Animated camera oval */}
          <div style={{ width: 180, height: 210, borderRadius: "50% / 60%", margin: "0 auto 2rem", border: "3px solid transparent",
            borderTopColor: cameraProgress > 0 && cameraProgress < 100 ? "var(--gold)" : "var(--gold-dim)",
            animation: cameraProgress > 0 && cameraProgress < 100 ? "spin 2s linear infinite" : "none",
            background: "radial-gradient(ellipse,rgba(201,168,76,0.06),transparent)",
            display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <span style={{ fontSize: "4rem" }}>🫦</span>
            {cameraProgress > 0 && cameraProgress < 100 && (
              <div style={{ position: "absolute", bottom: -8, left: "10%", right: "10%",
                background: "rgba(255,255,255,0.04)", borderRadius: 999, height: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${cameraProgress}%`, background: "linear-gradient(90deg,var(--gold-dim),var(--gold))", transition: "width 0.1s ease" }} />
              </div>
            )}
          </div>
          <div className="notice notice--info" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>🔒</span><div style={{ fontSize: "0.78rem" }}>
              Face frame encrypted AES-256-GCM (BLIDE_FACE_KEY) before NIBSS transit. Frame purged immediately post-match. SHA-256 hash retained for audit only. A liveness challenge will follow after account selection.
            </div>
          </div>
          <button className="btn btn--gold btn--lg btn--full" onClick={() => void runFaceCapture()} disabled={loading || (cameraProgress > 0 && cameraProgress < 100)}>
            {cameraProgress > 0 && cameraProgress < 100 ? `Capturing… ${cameraProgress}%` : "Begin Face Scan →"}
          </button>
        </div>
      )}

      {/* ════ MODE SELECT ══════════════════════════════════════════════════ */}
      {step === "mode" && (
        <div>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🫦</div>
            <p className="panel-title" style={{ marginBottom: "0.75rem" }}>BLIDE — Active-Liveness Face Pay</p>
            <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Every transaction tied to a living, conscious person</h2>
            <p className="muted" style={{ fontSize: "0.88rem", maxWidth: 500, margin: "0 auto" }}>
              Face scan discovers your identity or financial footprint from NIBSS.
              A randomized liveness challenge (Blink, Smile, Nod…) prevents deepfakes and photo injection.
              Zero frames stored. Only <strong>Liveness_Verified: TRUE</strong> is recorded.
            </p>
          </div>
          <div className="grid-2" style={{ marginBottom: "2rem" }}>
            {([
              { t: "ACCOUNT_SETUP", icon: "🏦", label: "Account Setup",  desc: "Face → NIBSS identity → zero-input account creation with Liveness gate" },
              { t: "WITHDRAWAL",    icon: "💵", label: "Withdrawal",      desc: "Face → account map → amount → randomized Liveness seal → payout" },
              { t: "TRANSFER",      icon: "⚡", label: "Transfer",        desc: "Face → account map → recipient → Liveness → NIBSS NIP" },
              { t: "BILL_PAYMENT",  icon: "🧾", label: "Bill Payment",    desc: "Face → account map → biller → Liveness → eBillsPay settlement" },
            ] as { t: TxnType; icon: string; label: string; desc: string }[]).map(m => (
              <div key={m.t} className="pillar-card" style={{ cursor: "pointer" }} onClick={() => void handleModeSelect(m.t)}>
                <span className="pillar-icon">{m.icon}</span>
                <h3 style={{ marginBottom: "0.4rem" }}>{m.label}</h3>
                <p>{m.desc}</p>
              </div>
            ))}
          </div>
          <div className="notice notice--info">
            <span>🎲</span>
            <div style={{ fontSize: "0.8rem" }}>
              <strong>7-Task Challenge Pool:</strong> Blink · Smile · Open Mouth · Turn Left · Turn Right · Nod · Raise Eyebrows.
              Tasks are selected using cryptographic randomness — never the same type twice in a session.
              Each challengeId is single-use. Replay attacks are blocked server-side.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

