import { useState } from "react";
import { LandingPage } from "./pages/LandingPage";
import { OnboardingStageA } from "./pages/OnboardingStageA";
import type { StageAData } from "./pages/OnboardingStageA";
import { OnboardingStageB } from "./pages/OnboardingStageB";
import { InstitutionalDashboard } from "./pages/InstitutionalDashboard";
import { LegacyMonitor } from "./pages/LegacyMonitor";
import { ZfoeOnboarding } from "./pages/ZfoeOnboarding";
import { BihGateway } from "./pages/BihGateway";
import { BlsWithdrawal } from "./pages/BlsWithdrawal";
import { BlideGateway } from "./pages/BlideGateway";
import { CommandCenter } from "./pages/CommandCenter";
import { RsccDashboard } from "./pages/RsccDashboard";
import { ZfpsMonitor } from "./pages/ZfpsMonitor";

type View = "landing" | "stage-a" | "stage-b" | "dashboard" | "monitor" | "zfoe" | "bih" | "bls" | "blide" | "casd" | "rscc" | "zfps";

export function App() {
  const [view, setView]           = useState<View>("landing");
  const [stageAData, setStageAData] = useState<StageAData | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── Nav Bar ────────────────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar__brand" style={{ cursor: "pointer" }} onClick={() => setView("landing")}>
          <div>
            <div className="navbar__logo">F-MAN TECHNOLOGIES</div>
            <div className="navbar__sub">Life OS — Institutional Gateway</div>
          </div>
        </div>
        <div className="navbar__links">
          <button className="btn btn--ghost btn--sm" onClick={() => setView("zfps")}>⚡ ZFPS</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("rscc")}>💰 RSCC</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("casd")}>⚙️ Command Center</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("blide")}>🫦 Face Pay</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("bls")}>🔍 BLS Sweep</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("bih")}>☞ BIH Scan</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("zfoe")}>🏦 Open Account</button>
          <button className="btn btn--ghost btn--sm" onClick={() => setView("monitor")}>⚡ Monitor</button>
          {view === "dashboard" && stageAData && (
            <span className="badge badge--ok" style={{ marginLeft: "0.5rem" }}>● API Keys Active</span>
          )}
          {view !== "landing" && (
            <button className="btn btn--outline btn--sm" onClick={() => setView("landing")}>← Gateway</button>
          )}
        </div>
      </nav>

      {/* ── View router ───────────────────────────────────────────────────── */}
      {view === "landing" && (
        <LandingPage
          onApply={() => setView("stage-a")}
          onMonitor={() => setView("monitor")}
          onZfoe={() => setView("zfoe")}
          onBih={() => setView("bih")}
          onBls={() => setView("bls")}
          onBlide={() => setView("blide")}
          onCasd={() => setView("casd")}
          onRscc={() => setView("rscc")}
          onZfps={() => setView("zfps")}
        />
      )}
      {view === "stage-a" && (
        <OnboardingStageA
          onSubmit={(data) => { setStageAData(data); setView("stage-b"); }}
          onBack={() => setView("landing")}
        />
      )}
      {view === "stage-b" && stageAData && (
        <OnboardingStageB
          stageAData={stageAData}
          onComplete={() => setView("dashboard")}
          onBack={() => setView("stage-a")}
        />
      )}
      {view === "dashboard" && stageAData && (
        <InstitutionalDashboard institution={stageAData} />
      )}
      {view === "monitor" && <LegacyMonitor />}
      {view === "zfoe" && <ZfoeOnboarding onBack={() => setView("landing")} />}
      {view === "bih"  && <BihGateway    onBack={() => setView("landing")} />}
      {view === "bls"   && <BlsWithdrawal onBack={() => setView("landing")} />}
      {view === "blide" && <BlideGateway  onBack={() => setView("landing")} />}
      {view === "casd"  && <CommandCenter  onBack={() => setView("landing")} />}
      {view === "rscc"  && <RsccDashboard  onBack={() => setView("landing")} />}
      {view === "zfps"  && <ZfpsMonitor    onBack={() => setView("landing")} />}
    </div>
  );
}
        <div className="panel stat">
          <span className="muted">NIBSS channel YES ratio (sample)</span>
          <strong className="ok">
            {exec ? `${(exec.verificationLedger.nibssChannelYesRatio * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Tx confirmed rate</span>
          <strong className="ok">
            {exec ? `${(exec.verificationLedger.transactionConfirmedRate * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Pulse batch pending</span>
          <strong className={exec && exec.pulseSync.pendingBatchSettlement > 0 ? "bad" : "ok"}>
            {exec?.pulseSync.pendingBatchSettlement ?? "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Ledger accounts</span>
          <strong>{exec?.executionLayer.ledgerAccounts ?? "—"}</strong>
        </div>
      </div>

      <div className="row">
        <div className="panel stat">
          <span className="muted">Sample success rate</span>
          <strong className="ok">
            {logs ? `${(logs.successRate * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Failure rate</span>
          <strong className={logs && logs.failureRate > 0 ? "bad" : "ok"}>
            {logs ? `${(logs.failureRate * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Sentinel alerts</span>
          <strong className={alerts.length ? "bad" : "ok"}>{alerts.length}</strong>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Recent NIBSS verification ledger</h2>
        {!logs?.recent.length ? (
          <p className="muted">No rows yet. Call POST /v1/identity/enroll or confirm-transaction.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Txn ID</th>
                <th>Policy</th>
                <th>FP</th>
                <th>Face</th>
                <th>Mobile</th>
                <th>OK</th>
              </tr>
            </thead>
            <tbody>
              {logs.recent.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.externalTransactionId}</td>
                  <td>{r.policyMode}</td>
                  <td>{r.fpOutcome}</td>
                  <td>{r.faceOutcome}</td>
                  <td>{r.mobileOutcome}</td>
                  <td className={r.aggregateConfirmed ? "ok" : "bad"}>
                    {r.aggregateConfirmed ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Identity mismatches (Sentinel)</h2>
        {!alerts.length ? (
          <p className="muted">No flagged mismatches.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Txn ID</th>
                <th>FP</th>
                <th>Face</th>
                <th>Mobile</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.externalTransactionId}</td>
                  <td>{r.fpOutcome}</td>
                  <td>{r.faceOutcome}</td>
                  <td>{r.mobileOutcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Liquidity mirror (dedicated accounts)</h2>
        {!liquidity.length ? (
          <p className="muted">No snapshots. POST /v1/admin/liquidity/ingest from your bank connector.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Captured</th><th>Partner</th><th>Account</th><th>Balance (minor)</th><th>CCY</th></tr>
            </thead>
            <tbody>
              {liquidity.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.capturedAt).toLocaleString()}</td>
                  <td>{r.partnerBank}</td><td>{r.accountRef}</td>
                  <td>{r.balanceMinor}</td><td>{r.currencyCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Unbanked Capture & Bankability ─────────────────────────────────── */}
      <div className="row">
        <div className="panel stat">
          <span className="muted">Total TFAN profiles</span>
          <strong>{unbanked?.profiles.total ?? "—"}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">Awaiting NIBSS push</span>
          <strong className={unbanked && unbanked.profiles.unbanked > 0 ? "bad" : "ok"}>
            {unbanked?.profiles.unbanked ?? "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">NIBSS submitted</span>
          <strong>{unbanked?.profiles.submitted ?? "—"}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">Bankable (BVN issued)</span>
          <strong className="ok">{unbanked?.profiles.bankable ?? "—"}</strong>
        </div>
        <div className="panel stat">
          <span className="muted">Bankability rate</span>
          <strong className="ok">
            {unbanked ? `${(unbanked.bankabilityRate * 100).toFixed(1)}%` : "—"}
          </strong>
        </div>
        <div className="panel stat">
          <span className="muted">Watch Eye log entries</span>
          <strong>{unbanked?.watchEye.supplementalLogEntries ?? "—"}</strong>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>National Push — recent NIBSS submissions</h2>
        {!unbanked?.recentNibssSubmissions.length ? (
          <p className="muted">No submissions yet. POST /v1/unbanked/push-nibss to trigger BVN generation.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Submitted</th><th>Enrollment ID</th><th>TFAN</th>
                <th>NIBSS Status</th><th>Profile Status</th><th>Shard</th><th>Response?</th>
              </tr>
            </thead>
            <tbody>
              {unbanked.recentNibssSubmissions.map((s) => (
                <tr key={s.enrollmentId}>
                  <td>{new Date(s.submittedAt).toLocaleString()}</td>
                  <td style={{ fontSize: "0.75rem" }}>{s.enrollmentId.slice(0, 24)}…</td>
                  <td>{s.tfanId}</td>
                  <td className={s.nibssStatus === "SUCCESS" ? "ok" : s.nibssStatus === "PENDING" ? "" : "bad"}>
                    {s.nibssStatus}
                  </td>
                  <td className={s.profileStatus === "BANKABLE" ? "ok" : ""}>{s.profileStatus}</td>
                  <td>{s.shardCountry}</td>
                  <td>{s.hasResponse ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
