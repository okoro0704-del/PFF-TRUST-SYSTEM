import { useEffect, useState } from "react";
import { StatusTracker } from "../components/StatusTracker";
import { BiometricGateModal } from "../components/BiometricGateModal";
import type { StageAData } from "./OnboardingStageA";

const API = "/api";

interface LiquidityRow { id: string; partnerBank: string; accountRef: string; balanceMinor: string; currencyCode: string; capturedAt: string; }
interface ExecMetrics { verificationLedger: { nibssChannelYesRatio: number; transactionConfirmedRate: number; pulseBatchPending: number; }; }
interface UnbankedMetrics { profiles: { total: number; unbanked: number; submitted: number; bankable: number }; bankabilityRate: number; }
interface LogsResponse  { total: number; successRate: number; failureRate: number; recent: LogRow[]; }
interface LogRow { id: string; externalTransactionId: string; policyMode: string; aggregateConfirmed: boolean; fpOutcome: string; faceOutcome: string; mobileOutcome: string; createdAt: string; }

// ── Stub agent payout ledger (replace with real API when /v1/admin/agent-ledger is wired) ──
const STUB_LEDGER = [
  { id: "1", type: "DEBIT",  label: "Agent Commission — Ayo Balogun", amount: "₦12,400", ref: "AGT-0042", time: "Today, 14:32" },
  { id: "2", type: "DEBIT",  label: "2% Liquidity Reward — Cycle #88", amount: "₦8,200",  ref: "LIQ-0088", time: "Today, 11:15" },
  { id: "3", type: "CREDIT", label: "License Fee Credit — Q1 2026",    amount: "₦500,000",ref: "LIC-Q126", time: "Mar 1, 09:00" },
  { id: "4", type: "DEBIT",  label: "Agent Commission — Ngozi Eze",    amount: "₦9,600",  ref: "AGT-0041", time: "Feb 29, 16:40" },
  { id: "5", type: "DEBIT",  label: "2% Liquidity Reward — Cycle #87", amount: "₦7,800",  ref: "LIQ-0087", time: "Feb 28, 23:59" },
  { id: "6", type: "CREDIT", label: "UNWP Reconciliation Credit",       amount: "₦45,000", ref: "UNWP-0099",time: "Feb 27, 10:20" },
];

interface InstitutionalDashboardProps { institution: StageAData; }

export function InstitutionalDashboard({ institution }: InstitutionalDashboardProps) {
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [showModal, setShowModal]             = useState(false);
  const [liquidity, setLiquidity]   = useState<LiquidityRow[]>([]);
  const [exec, setExec]             = useState<ExecMetrics | null>(null);
  const [unbanked, setUnbanked]     = useState<UnbankedMetrics | null>(null);
  const [logs, setLogs]             = useState<LogsResponse | null>(null);
  const [health, setHealth]         = useState<{ database?: string } | null>(null);
  const [err, setErr]               = useState<string | null>(null);

  const load = async () => {
    try {
      const [q, ex, ub, l, h] = await Promise.all([
        fetch(`${API}/v1/admin/liquidity`).then(r => r.json()),
        fetch(`${API}/v1/admin/execution/metrics?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/unbanked/metrics?orgId=default`).then(r => r.json()),
        fetch(`${API}/v1/admin/logs?orgId=default`).then(r => r.json()),
        fetch(`${API}/health`).then(r => r.json()),
      ]);
      setLiquidity(q); setExec(ex); setUnbanked(ub); setLogs(l); setHealth(h);
    } catch (e) { setErr(String(e)); }
  };

  useEffect(() => { void load(); const t = setInterval(() => void load(), 8000); return () => clearInterval(t); }, []);

  const fmtMinor = (m: string) => `₦${(Number(m) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const totalFloat = liquidity.reduce((s, r) => s + Number(r.balanceMinor), 0);

  return (
    <div>
      <div className="container" style={{ padding: "2.5rem 2rem" }}>
        <StatusTracker stage={4} />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex justify-between items-center mb-2" style={{ flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <p className="panel-title">Institutional Dashboard</p>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>{institution.institutionName}</h2>
            <p className="muted text-sm">License: {institution.cbnLicenseNo} · {institution.jurisdiction} · Signatory: {institution.signatoryName}</p>
          </div>
          <div className="flex gap-1">
            <span className="badge badge--ok">● API Keys Active</span>
            <span className={`badge ${health?.database === "up" ? "badge--ok" : "badge--bad"}`}>
              DB {health?.database ?? "—"}
            </span>
          </div>
        </div>

        {err && <div className="notice notice--bad"><span>⚠</span>{err}</div>}

        {/* ── KPI row ─────────────────────────────────────────────────────── */}
        <div className="grid-4" style={{ marginBottom: "1.5rem" }}>
          {[
            { label: "Operational Float", value: fmtMinor(totalFloat.toString()), sub: "Dedicated account balance", color: "var(--gold-bright)" },
            { label: "NIBSS YES Ratio",   value: exec ? `${(exec.verificationLedger.nibssChannelYesRatio * 100).toFixed(1)}%` : "—", sub: "Biometric match rate", color: "var(--ok)" },
            { label: "Tx Confirmed Rate", value: exec ? `${(exec.verificationLedger.transactionConfirmedRate * 100).toFixed(1)}%` : "—", sub: "Live execution", color: "var(--ok)" },
            { label: "Bankable Profiles", value: unbanked?.profiles.bankable.toString() ?? "—", sub: `of ${unbanked?.profiles.total ?? "—"} enrolled`, color: "var(--text)" },
          ].map(s => (
            <div key={s.label} className="panel">
              <p className="stat-label">{s.label}</p>
              <p className="stat-value" style={{ color: s.color, fontSize: "1.5rem" }}>{s.value}</p>
              <p className="stat-sub">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ────────────────────────────────────────────── */}
        <div className="grid-2">
          {/* Agent Payout Ledger */}
          <div className="panel">
            <div className="flex justify-between items-center" style={{ marginBottom: "1rem" }}>
              <p className="panel-title" style={{ marginBottom: 0 }}>Dedicated Account Ledger</p>
              <span className="badge badge--gold pulse">● Live</span>
            </div>
            {STUB_LEDGER.map(row => (
              <div key={row.id} className="ledger-row">
                <span className={`ledger-row__type ${row.type === "DEBIT" ? "bad" : "ok"}`}>{row.type}</span>
                <span className={`ledger-row__amount ${row.type === "DEBIT" ? "bad" : "ok"}`}>{row.amount}</span>
                <div className="ledger-row__desc">
                  <div style={{ fontSize: "0.82rem", color: "var(--text)" }}>{row.label}</div>
                  <div className="text-xs dim">{row.ref}</div>
                </div>
                <span className="ledger-row__time">{row.time}</span>
              </div>
            ))}
            <p className="text-xs dim" style={{ marginTop: "0.75rem" }}>
              All debits are auto-pulled by the LLIW engine · Credits from license billing
            </p>
          </div>

          {/* Liquidity Mirror + NIBSS log */}
          <div>
            <div className="panel" style={{ marginBottom: "1.25rem" }}>
              <p className="panel-title" style={{ marginBottom: "1rem" }}>Liquidity Mirror — Dedicated Accounts</p>
              {!liquidity.length ? (
                <p className="muted text-sm">No snapshots yet. Ingest via POST /v1/admin/liquidity/ingest.</p>
              ) : (
                <table>
                  <thead><tr><th>Partner</th><th>Account</th><th>Balance</th><th>CCY</th></tr></thead>
                  <tbody>
                    {liquidity.map(r => (
                      <tr key={r.id}>
                        <td>{r.partnerBank}</td><td className="mono" style={{ fontSize: "0.78rem" }}>{r.accountRef}</td>
                        <td className="gold">{fmtMinor(r.balanceMinor)}</td><td>{r.currencyCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Biometric-Gated Sensitive View */}
            <div className="panel--gold">
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>🔐 Sensitive Liquidity Data</p>
              {!biometricPassed ? (
                <>
                  <p className="muted text-sm" style={{ marginBottom: "1rem" }}>
                    Full account balances, API key details, and agent payout schedules require biometric
                    confirmation from the authorized signatory ({institution.signatoryName}).
                  </p>
                  <button className="btn btn--gold btn--full" onClick={() => setShowModal(true)}>
                    Verify Identity to Unlock →
                  </button>
                </>
              ) : (
                <div>
                  <div className="flex gap-1 items-center" style={{ marginBottom: "0.75rem" }}>
                    <span className="badge badge--ok">✓ NIBSS Verified</span>
                    <span className="text-xs dim">{institution.signatoryName}</span>
                  </div>
                  <div className="form-grid" style={{ marginBottom: "0.75rem" }}>
                    {[
                      ["API Key (Live)", "sk_live_••••••••••••xA4m"],
                      ["API Key (Test)", "sk_test_••••••••••••bZ9k"],
                      ["Webhook Secret", "whsec_••••••••••••qR2j"],
                      ["Org ID",         "org_fman_" + institution.rcNumber.replace(/\s/g,"").toLowerCase()],
                    ].map(([k,v]) => (
                      <div key={k} style={{ background: "var(--bg)", padding: "0.65rem 0.9rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                        <p className="text-xs dim" style={{ marginBottom: "0.2rem" }}>{k}</p>
                        <p className="mono" style={{ fontSize: "0.78rem", color: "var(--gold)" }}>{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── NIBSS Verification Ledger ────────────────────────────────────── */}
        <div className="panel">
          <p className="panel-title" style={{ marginBottom: "1rem" }}>NIBSS Verification Ledger — Recent (auto-refresh 8s)</p>
          {!logs?.recent.length ? (
            <p className="muted text-sm">No entries. Trigger via POST /v1/identity/enroll or confirm-transaction.</p>
          ) : (
            <table>
              <thead><tr><th>Time</th><th>Txn ID</th><th>Policy</th><th>FP</th><th>Face</th><th>Mobile</th><th>Confirmed</th></tr></thead>
              <tbody>
                {logs.recent.slice(0, 8).map(r => (
                  <tr key={r.id}>
                    <td className="dim" style={{ fontSize: "0.75rem" }}>{new Date(r.createdAt).toLocaleTimeString()}</td>
                    <td className="mono" style={{ fontSize: "0.75rem" }}>{r.externalTransactionId.slice(0, 18)}…</td>
                    <td>{r.policyMode}</td>
                    <td className={r.fpOutcome === "match_found" ? "ok" : "bad"}>{r.fpOutcome === "match_found" ? "✓" : "✗"}</td>
                    <td className={r.faceOutcome === "match_found" ? "ok" : "bad"}>{r.faceOutcome === "match_found" ? "✓" : "✗"}</td>
                    <td className={r.mobileOutcome === "match_found" ? "ok" : "bad"}>{r.mobileOutcome === "match_found" ? "✓" : "✗"}</td>
                    <td className={r.aggregateConfirmed ? "ok" : "bad"}>{r.aggregateConfirmed ? "YES" : "NO"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <BiometricGateModal
          onVerified={() => { setBiometricPassed(true); setShowModal(false); }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

