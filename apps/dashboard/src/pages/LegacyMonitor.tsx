import { useEffect, useState } from "react";

const API = "/api";

type LogRow = { id: string; externalTransactionId: string; policyMode: string; aggregateConfirmed: boolean; mismatchAlert: boolean; fpOutcome: string; faceOutcome: string; mobileOutcome: string; createdAt: string; };
type LogsResponse = { total: number; successRate: number; failureRate: number; recent: LogRow[]; };
type LiquidityRow = { id: string; partnerBank: string; accountRef: string; balanceMinor: string; currencyCode: string; capturedAt: string; };
type ExecMetrics = { verificationLedger: { sampleSize: number; transactionConfirmedRate: number; nibssChannelYesRatio: number; }; executionLayer: { ledgerAccounts: number; ledgerTransfersTotal: number; provisionalTransfersPendingBatch: number; }; pulseSync: { pendingBatchSettlement: number }; };
type UnbankedMetrics = { profiles: { total: number; unbanked: number; submitted: number; bankable: number; duplicateLinked: number; }; bankabilityRate: number; watchEye: { supplementalLogEntries: number }; recentNibssSubmissions: { enrollmentId: string; nibssStatus: string; tfanId: string; profileStatus: string; shardCountry: string; submittedAt: string; hasResponse: boolean; }[]; };

export function LegacyMonitor() {
  const [logs, setLogs]         = useState<LogsResponse | null>(null);
  const [alerts, setAlerts]     = useState<LogRow[]>([]);
  const [liquidity, setLiquidity] = useState<LiquidityRow[]>([]);
  const [exec, setExec]         = useState<ExecMetrics | null>(null);
  const [unbanked, setUnbanked] = useState<UnbankedMetrics | null>(null);
  const [health, setHealth]     = useState<{ database?: string; status?: string } | null>(null);
  const [err, setErr]           = useState<string | null>(null);

  const load = async () => {
    setErr(null);
    try {
      const [l, a, q, ex, ub, h, root] = await Promise.all([
        fetch(`${API}/v1/admin/logs?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/alerts/sentinel?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/liquidity`).then(r => r.json()),
        fetch(`${API}/v1/admin/execution/metrics?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/unbanked/metrics?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/system/health`).then(r => r.json()),
        fetch(`${API}/health`).then(r => r.json()),
      ]);
      setLogs(l); setAlerts(a); setLiquidity(q); setExec(ex); setUnbanked(ub); setHealth({ ...h, ...root });
    } catch (e) { setErr(String(e)); }
  };

  useEffect(() => { void load(); const t = setInterval(() => void load(), 8000); return () => clearInterval(t); }, []);

  return (
    <div className="container" style={{ padding: "2.5rem 2rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <p className="panel-title">Raw API Monitor</p>
        <h2 className="serif">NIBSS Verification Ledger</h2>
        <p className="muted text-sm">Live headless monitoring — auto-refresh 8s</p>
      </div>

      {err && <div className="notice notice--bad"><span>⚠</span>{err}</div>}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="row" style={{ marginBottom: "1.25rem" }}>
        {[
          { label: "API / DB",           value: health?.database ?? health?.status ?? "—", cls: health?.database === "up" ? "ok" : "bad" },
          { label: "NIBSS YES ratio",    value: exec ? `${(exec.verificationLedger.nibssChannelYesRatio * 100).toFixed(1)}%` : "—", cls: "ok" },
          { label: "Tx confirmed",       value: exec ? `${(exec.verificationLedger.transactionConfirmedRate * 100).toFixed(1)}%` : "—", cls: "ok" },
          { label: "Pulse batch pending",value: exec?.pulseSync.pendingBatchSettlement.toString() ?? "—", cls: exec?.pulseSync.pendingBatchSettlement ? "bad" : "ok" },
          { label: "Ledger accounts",    value: exec?.executionLayer.ledgerAccounts.toString() ?? "—", cls: "" },
          { label: "Success rate",       value: logs ? `${(logs.successRate * 100).toFixed(1)}%` : "—", cls: "ok" },
          { label: "Sentinel alerts",    value: alerts.length.toString(), cls: alerts.length ? "bad" : "ok" },
        ].map(s => (
          <div key={s.label} className="panel stat">
            <span className="muted">{s.label}</span>
            <strong className={s.cls}>{s.value}</strong>
          </div>
        ))}
      </div>

      {/* ── NIBSS log ────────────────────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <p className="panel-title" style={{ marginBottom: "1rem" }}>Recent NIBSS Verifications</p>
        {!logs?.recent.length ? <p className="muted text-sm">No rows yet.</p> : (
          <table>
            <thead><tr><th>Time</th><th>Txn ID</th><th>Policy</th><th>FP</th><th>Face</th><th>Mobile</th><th>OK</th></tr></thead>
            <tbody>
              {logs.recent.map(r => (
                <tr key={r.id}>
                  <td className="dim" style={{ fontSize: "0.75rem" }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="mono" style={{ fontSize: "0.75rem" }}>{r.externalTransactionId.slice(0,20)}…</td>
                  <td>{r.policyMode}</td>
                  <td className={r.fpOutcome === "match_found" ? "ok" : "bad"}>{r.fpOutcome === "match_found" ? "✓" : "✗"}</td>
                  <td className={r.faceOutcome === "match_found" ? "ok" : "bad"}>{r.faceOutcome === "match_found" ? "✓" : "✗"}</td>
                  <td className={r.mobileOutcome === "match_found" ? "ok" : "bad"}>{r.mobileOutcome === "match_found" ? "✓" : "✗"}</td>
                  <td className={r.aggregateConfirmed ? "ok" : "bad"}>{r.aggregateConfirmed ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Sentinel alerts ───────────────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <p className="panel-title" style={{ marginBottom: "1rem" }}>Identity Mismatches (Sentinel)</p>
        {!alerts.length ? <p className="muted text-sm">No flagged mismatches.</p> : (
          <table>
            <thead><tr><th>Time</th><th>Txn ID</th><th>FP</th><th>Face</th><th>Mobile</th></tr></thead>
            <tbody>
              {alerts.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.externalTransactionId}</td>
                  <td>{r.fpOutcome}</td><td>{r.faceOutcome}</td><td>{r.mobileOutcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Liquidity mirror ──────────────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: "1.25rem" }}>
        <p className="panel-title" style={{ marginBottom: "1rem" }}>Liquidity Mirror — Dedicated Accounts</p>
        {!liquidity.length ? <p className="muted text-sm">No snapshots. POST /v1/admin/liquidity/ingest.</p> : (
          <table>
            <thead><tr><th>Captured</th><th>Partner</th><th>Account</th><th>Balance (minor)</th><th>CCY</th></tr></thead>
            <tbody>
              {liquidity.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.capturedAt).toLocaleString()}</td>
                  <td>{r.partnerBank}</td><td>{r.accountRef}</td><td>{r.balanceMinor}</td><td>{r.currencyCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Unbanked metrics ──────────────────────────────────────────────── */}
      <div className="row" style={{ marginBottom: "1.25rem" }}>
        {[
          { label: "Total TFAN profiles",   value: unbanked?.profiles.total ?? "—", cls: "" },
          { label: "Awaiting NIBSS push",   value: unbanked?.profiles.unbanked ?? "—", cls: unbanked?.profiles.unbanked ? "bad" : "ok" },
          { label: "NIBSS submitted",       value: unbanked?.profiles.submitted ?? "—", cls: "" },
          { label: "Bankable (BVN issued)", value: unbanked?.profiles.bankable ?? "—", cls: "ok" },
          { label: "Bankability rate",      value: unbanked ? `${(unbanked.bankabilityRate * 100).toFixed(1)}%` : "—", cls: "ok" },
          { label: "Watch Eye entries",     value: unbanked?.watchEye.supplementalLogEntries ?? "—", cls: "" },
        ].map(s => (
          <div key={s.label} className="panel stat">
            <span className="muted">{s.label}</span>
            <strong className={s.cls}>{String(s.value)}</strong>
          </div>
        ))}
      </div>

      <div className="panel">
        <p className="panel-title" style={{ marginBottom: "1rem" }}>National Push — Recent NIBSS Submissions</p>
        {!unbanked?.recentNibssSubmissions.length ? <p className="muted text-sm">No submissions yet.</p> : (
          <table>
            <thead><tr><th>Submitted</th><th>Enrollment ID</th><th>TFAN</th><th>NIBSS</th><th>Profile</th><th>Shard</th><th>Resp?</th></tr></thead>
            <tbody>
              {unbanked.recentNibssSubmissions.map(s => (
                <tr key={s.enrollmentId}>
                  <td>{new Date(s.submittedAt).toLocaleString()}</td>
                  <td className="mono" style={{ fontSize: "0.72rem" }}>{s.enrollmentId.slice(0,22)}…</td>
                  <td>{s.tfanId}</td>
                  <td className={s.nibssStatus === "SUCCESS" ? "ok" : s.nibssStatus === "PENDING" ? "" : "bad"}>{s.nibssStatus}</td>
                  <td className={s.profileStatus === "BANKABLE" ? "ok" : ""}>{s.profileStatus}</td>
                  <td>{s.shardCountry}</td><td>{s.hasResponse ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

