import { useState, useEffect, useCallback } from "react";

const API = "/api";
type Tab = "pipeline" | "vault" | "pulse" | "reconciliation";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BankDoc { id: string; documentType: string; documentName: string; verifiedAt: string | null; uploadedAt: string; fileSizeBytes: number | null; }
interface BankApp { id: string; bankName: string; bankCode: string | null; bankCategory: string; contactName: string; contactEmail: string; status: string; reviewerNotes: string | null; approvedAt: string | null; pushCount: number; documents: BankDoc[]; createdAt: string; }
interface SovereignDoc { id: string; documentType: string; documentName: string; issuingAuthority: string; issueDate: string; expiryDate: string | null; isActive: boolean; downloadCount: number; }
interface PushRecord { id: string; pushType: string; deliveryStatus: string; sentAt: string | null; application: { bankName: string }; document: { documentName: string; documentType: string } | null; }
interface PulseMetrics {
  bsss: { nibssYesCalls: number; matchRate: number; livenessSuccessRate: number; faceTotal: number; fingerprintTotal: number; todayMatches: number; };
  sovereignExec: { totalTransactions: number; totalVolumeNaira: string; withdrawals: number; transfers: number; billPayments: number; accountSetups: number; };
  securedSaving: { tvlNaira: string; activeAjoCycles: number; completedCycles: number; safeBreaks: number; penaltyRevenueNaira: string; };
  biometricExchequer: { totalWithdrawals: number; heatmapByHour: number[]; biometricBypass: number; tenMRuleApplied: number; avgWithdrawalNaira: string; };
  generatedAt: string;
}
interface ReconciliationData {
  split: { totalDay1FeesNaira: string; fmanShareNaira: string; networkShareNaira: string; fmanPct: number; networkPct: number; totalAccountsOnboarded: number; };
  liquidityAccounts: { bankName: string; bankCode: string; balanceDisplay: string; availableForCommissions: string; percentUtilized: number; lastUpdated: string; }[];
}

const STATUS_META: Record<string, { color: string; label: string; next: string | null }> = {
  PENDING_REVIEW:           { color: "#f59e0b", label: "Pending Review",           next: "VERIFICATION_IN_PROGRESS" },
  VERIFICATION_IN_PROGRESS: { color: "#3b82f6", label: "Verification In Progress", next: "APPROVED" },
  APPROVED:                 { color: "#22c55e", label: "Approved",                 next: null },
  REJECTED:                 { color: "#ef4444", label: "Rejected",                 next: null },
};
const DOC_ICON: Record<string, string> = {
  CBN_LICENSE:"🏛", BOG_LICENSE:"🏛", CORPORATE_REG:"📋", BIOMETRIC_SIGNATORY:"☞",
  TAX_CLEARANCE:"🧾", OTHER:"📄", CAC_INCORPORATION:"📜", DIRECTORS_BIOMETRIC:"☞",
  DIRECTORS_ID:"🪪", OPERATIONAL_PERMIT:"✅", NDIC_REGISTRATION:"🔐",
};

export function CommandCenter({ onBack }: { onBack: () => void }) {
  const [tab, setTab]                   = useState<Tab>("pipeline");
  const [banks, setBanks]               = useState<BankApp[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedBank, setExpandedBank] = useState<string | null>(null);
  const [vaultDocs, setVaultDocs]       = useState<SovereignDoc[]>([]);
  const [recentPushes, setRecentPushes] = useState<PushRecord[]>([]);
  const [pulse, setPulse]               = useState<PulseMetrics | null>(null);
  const [recon, setRecon]               = useState<ReconciliationData | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const [bRes, vRes, pRes, rRes, pushRes] = await Promise.all([
        fetch(`${API}/v1/casd/banks${qs}`),
        fetch(`${API}/v1/casd/sovereign`),
        fetch(`${API}/v1/casd/pulse`),
        fetch(`${API}/v1/casd/reconciliation`),
        fetch(`${API}/v1/casd/sovereign/pushes?limit=10`),
      ]);
      const [bData, vData, pData, rData, pushData] = await Promise.all([
        bRes.json() as Promise<{ applications: BankApp[] }>,
        vRes.json() as Promise<{ documents: SovereignDoc[] }>,
        pRes.json() as Promise<PulseMetrics>,
        rRes.json() as Promise<ReconciliationData>,
        pushRes.json() as Promise<{ pushes: PushRecord[] }>,
      ]);
      setBanks(bData.applications ?? []); setVaultDocs(vData.documents ?? []);
      setPulse(pData); setRecon(rData); setRecentPushes(pushData.pushes ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const advanceStatus = async (id: string, status: string, notes?: string) => {
    setActionLoading(id);
    try {
      await fetch(`${API}/v1/casd/banks/${id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewerNotes: notes }),
      });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setActionLoading(null); }
  };

  const pushAll = async (id: string) => {
    setActionLoading(`push-${id}`);
    try {
      await fetch(`${API}/v1/casd/banks/${id}/push`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setActionLoading(null); }
  };

  const downloadDoc = async (id: string) => {
    await fetch(`${API}/v1/casd/sovereign/${id}/download`, { method: "POST" });
    await load();
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "pipeline",       label: "Bank Pipeline",   icon: "🏦" },
    { id: "vault",          label: "Sovereign Vault",  icon: "🔐" },
    { id: "pulse",          label: "Pulse Monitor",    icon: "📡" },
    { id: "reconciliation", label: "Reconciliation",   icon: "⚖️" },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <div>
          <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "0.75rem" }}>← Back</button>
          <p className="panel-title" style={{ marginBottom: "0.25rem" }}>F-Man Technologies</p>
          <h1 className="serif" style={{ fontSize: "1.6rem", color: "var(--gold-bright)" }}>⚙️ Command Center</h1>
          <p className="text-xs dim">Central Nerve System — Admin & Settlement Dashboard</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <button className="btn btn--gold btn--sm" onClick={() => void load()} disabled={loading}>
            {loading ? <span className="spin">⏳</span> : "↻ Refresh"}
          </button>
          <p className="text-xs dim" style={{ marginTop: "0.4rem" }}>{pulse?.generatedAt ? new Date(pulse.generatedAt).toLocaleTimeString() : "—"}</p>
        </div>
      </div>

      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", borderBottom: "1px solid var(--border)", paddingBottom: "0" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "0.6rem 1.1rem", background: "none", border: "none",
            borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
            color: tab === t.id ? "var(--gold-bright)" : "var(--text-dim)",
            fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", fontSize: "0.88rem",
            transition: "all 0.15s",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ════ TAB: BANK PIPELINE ═══════════════════════════════════════════ */}
      {tab === "pipeline" && (
        <div>
          <div className="flex justify-between items-center" style={{ marginBottom: "1.25rem" }}>
            <div>
              <h2 className="serif" style={{ marginBottom: "0.25rem" }}>Institutional Onboarding Queue</h2>
              <p className="text-xs dim">{banks.length} institutions — click status badge to advance</p>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {["", "PENDING_REVIEW", "VERIFICATION_IN_PROGRESS", "APPROVED", "REJECTED"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} style={{
                  padding: "0.3rem 0.7rem", borderRadius: 999, fontSize: "0.72rem", cursor: "pointer",
                  background: statusFilter === s ? "var(--gold)" : "var(--bg-panel)",
                  color: statusFilter === s ? "#0C0C10" : "var(--text-dim)",
                  border: "1px solid var(--border)", fontWeight: statusFilter === s ? 700 : 400,
                }}>{s || "All"}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {banks.map(app => {
              const meta = STATUS_META[app.status] ?? { color: "#888", label: app.status, next: null };
              const isExpanded = expandedBank === app.id;
              return (
                <div key={app.id} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                  <div style={{ padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.3rem" }}>
                        <span style={{ fontWeight: 700, fontSize: "1rem" }}>{app.bankName}</span>
                        <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{app.bankCategory}</span>
                        {app.pushCount > 0 && <span style={{ fontSize: "0.65rem", color: "var(--ok)", fontWeight: 600 }}>● {app.pushCount} docs pushed</span>}
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{app.contactName} · {app.contactEmail}</p>
                      <p className="text-xs dim">{new Date(app.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
                      <span style={{ padding: "0.25rem 0.65rem", borderRadius: 999, background: meta.color + "20", color: meta.color, fontSize: "0.72rem", fontWeight: 700 }}>{meta.label}</span>
                      {meta.next && (
                        <button className="btn btn--sm" style={{ fontSize: "0.72rem", padding: "0.25rem 0.65rem" }}
                          onClick={() => void advanceStatus(app.id, meta.next!)}
                          disabled={actionLoading === app.id}>
                          {actionLoading === app.id ? "…" : `→ ${STATUS_META[meta.next]?.label}`}
                        </button>
                      )}
                      {app.status === "APPROVED" && (
                        <button className="btn btn--sm" style={{ fontSize: "0.72rem", padding: "0.25rem 0.65rem", background: "var(--gold)", color: "#0C0C10" }}
                          onClick={() => void pushAll(app.id)}
                          disabled={actionLoading === `push-${app.id}`}>
                          {actionLoading === `push-${app.id}` ? "…" : "↑ Push Docs"}
                        </button>
                      )}
                      {app.status !== "APPROVED" && app.status !== "REJECTED" && (
                        <button className="btn btn--sm" style={{ fontSize: "0.72rem", padding: "0.25rem 0.65rem", background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                          onClick={() => void advanceStatus(app.id, "REJECTED", "Rejected by admin")}>Reject</button>
                      )}
                      <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.7rem" }} onClick={() => setExpandedBank(isExpanded ? null : app.id)}>
                        {isExpanded ? "▲" : "▼"} Docs ({app.documents.length})
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1.25rem", background: "rgba(0,0,0,0.08)" }}>
                      {app.documents.length === 0
                        ? <p className="text-xs dim">No documents uploaded</p>
                        : app.documents.map(d => (
                          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderBottom: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                              <span>{DOC_ICON[d.documentType] ?? "📄"}</span>
                              <span style={{ fontSize: "0.82rem" }}>{d.documentName}</span>
                              <span className="badge badge--dim" style={{ fontSize: "0.58rem" }}>{d.documentType.replace("_", " ")}</span>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              {d.verifiedAt
                                ? <span style={{ fontSize: "0.7rem", color: "var(--ok)" }}>✓ Verified</span>
                                : <span style={{ fontSize: "0.7rem", color: "#f59e0b" }}>⏳ Pending</span>}
                              <p className="text-xs dim">{d.fileSizeBytes ? `${(d.fileSizeBytes / 1024).toFixed(0)} KB` : ""}</p>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ════ TAB: SOVEREIGN VAULT ═════════════════════════════════════════ */}
      {tab === "vault" && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>F-Man Technologies — Sovereign Vault</h2>
            <p className="text-xs dim">Pre-verified regulatory documents · Auto-dispatched on bank approval</p>
          </div>

          {/* Document cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: "0.9rem", marginBottom: "2rem" }}>
            {vaultDocs.map(d => {
              const expired = d.expiryDate ? new Date(d.expiryDate) < new Date() : false;
              return (
                <div key={d.id} style={{ background: "var(--bg-panel)", border: `1px solid ${expired ? "rgba(239,68,68,0.35)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "1.1rem 1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                    <span style={{ fontSize: "1.6rem" }}>{DOC_ICON[d.documentType] ?? "📄"}</span>
                    <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
                      {d.isActive && !expired && <span className="badge badge--ok" style={{ fontSize: "0.6rem" }}>Active</span>}
                      {expired && <span className="badge badge--bad" style={{ fontSize: "0.6rem" }}>Expired</span>}
                      <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{d.documentType.replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.3rem", lineHeight: 1.3 }}>{d.documentName}</p>
                  <p className="text-xs dim" style={{ marginBottom: "0.6rem" }}>{d.issuingAuthority}</p>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p className="text-xs dim">Issued: {new Date(d.issueDate).toLocaleDateString()}</p>
                      {d.expiryDate && <p className="text-xs dim" style={{ color: expired ? "var(--bad)" : "var(--text-dim)" }}>Expires: {new Date(d.expiryDate).toLocaleDateString()}</p>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="text-xs dim">{d.downloadCount} downloads</p>
                      <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.65rem", marginTop: "0.25rem" }} onClick={() => void downloadDoc(d.id)}>↓ Download</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent Push History */}
          <div>
            <h3 className="serif" style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}>Recent Push History</h3>
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              {recentPushes.length === 0 ? (
                <p className="text-xs dim" style={{ padding: "1.5rem", textAlign: "center" }}>No pushes yet — approve a bank to trigger auto-push</p>
              ) : recentPushes.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 1.1rem", borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{p.application.bankName}</span>
                      <span className="badge badge--dim" style={{ fontSize: "0.58rem" }}>{p.pushType}</span>
                    </div>
                    <p className="text-xs dim">{p.document?.documentName ?? "All documents"}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, color: p.deliveryStatus === "SENT" ? "var(--ok)" : p.deliveryStatus === "FAILED" ? "var(--bad)" : "var(--gold)" }}>
                      {p.deliveryStatus === "SENT" ? "✓ Sent" : p.deliveryStatus === "FAILED" ? "✗ Failed" : "⏳ Queued"}
                    </span>
                    <p className="text-xs dim">{p.sentAt ? new Date(p.sentAt).toLocaleTimeString() : "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: PULSE MONITOR ═══════════════════════════════════════════ */}
      {tab === "pulse" && pulse && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>Four-Pillar Pulse Monitor</h2>
            <p className="text-xs dim">Live system health · {new Date(pulse.generatedAt).toLocaleString()}</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
            {/* BSSS */}
            <div className="panel--gold" style={{ minHeight: 180 }}>
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>☞ BSSS — Biometric Scan</p>
              {[
                ["NIBSS YES Calls",       pulse.bsss.nibssYesCalls],
                ["Match Rate",            `${pulse.bsss.matchRate}%`],
                ["Liveness Pass Rate",    `${pulse.bsss.livenessSuccessRate}%`],
                ["Face Sessions",         pulse.bsss.faceTotal],
                ["Fingerprint Sessions",  pulse.bsss.fingerprintTotal],
                ["Today's Matches",       pulse.bsss.todayMatches],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs dim">{k}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: String(k).includes("Rate") ? "var(--ok)" : "var(--text)" }}>{v}</span>
                </div>
              ))}
              {/* Liveness rate bar */}
              <div style={{ marginTop: "0.75rem" }}>
                <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 6 }}>
                  <div style={{ height: "100%", width: `${pulse.bsss.livenessSuccessRate}%`, background: "linear-gradient(90deg,#22c55e,#86efac)", borderRadius: 999, transition: "width 0.5s" }} />
                </div>
                <p className="text-xs dim" style={{ marginTop: "0.25rem" }}>Liveness {pulse.bsss.livenessSuccessRate}% pass</p>
              </div>
            </div>

            {/* Sovereign Exec */}
            <div className="panel--gold" style={{ minHeight: 180 }}>
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>⚡ Sovereign Execution</p>
              {[
                ["Total Transactions",  pulse.sovereignExec.totalTransactions],
                ["Total Volume",        pulse.sovereignExec.totalVolumeNaira],
                ["Withdrawals",         pulse.sovereignExec.withdrawals],
                ["Transfers",           pulse.sovereignExec.transfers],
                ["Bill Payments",       pulse.sovereignExec.billPayments],
                ["Account Setups",      pulse.sovereignExec.accountSetups],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs dim">{k}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: String(k).includes("Volume") ? "var(--gold-bright)" : "var(--text)" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Secured Saving Ajo */}
            <div className="panel--gold" style={{ minHeight: 180 }}>
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>🏺 Secured Saving (Ajo)</p>
              {[
                ["Total Value Locked",  pulse.securedSaving.tvlNaira],
                ["Active Ajo Cycles",   pulse.securedSaving.activeAjoCycles],
                ["Completed Cycles",    pulse.securedSaving.completedCycles],
                ["Safe Breaks",         pulse.securedSaving.safeBreaks],
                ["Penalty Revenue",     pulse.securedSaving.penaltyRevenueNaira],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs dim">{k}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: String(k).includes("Locked") || String(k).includes("Revenue") ? "var(--gold-bright)" : String(k).includes("Break") ? "var(--bad)" : "var(--text)" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Biometric Exchequer */}
            <div className="panel--gold" style={{ minHeight: 180 }}>
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>💰 Biometric Exchequer</p>
              {[
                ["Total Withdrawals",   pulse.biometricExchequer.totalWithdrawals],
                ["Avg Withdrawal",      pulse.biometricExchequer.avgWithdrawalNaira],
                ["10m-Rule Applied",    pulse.biometricExchequer.tenMRuleApplied],
                ["Biometric Bypass",    pulse.biometricExchequer.biometricBypass],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs dim">{k}</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: String(k).includes("Bypass") && Number(v) > 0 ? "var(--bad)" : "var(--text)" }}>{v}</span>
                </div>
              ))}
              {/* 24-hour withdrawal heatmap */}
              <div style={{ marginTop: "0.9rem" }}>
                <p className="text-xs dim" style={{ marginBottom: "0.4rem" }}>24h Withdrawal Heatmap</p>
                <div style={{ display: "flex", gap: "2px" }}>
                  {pulse.biometricExchequer.heatmapByHour.map((count, h) => {
                    const max = Math.max(...pulse.biometricExchequer.heatmapByHour, 1);
                    const intensity = count / max;
                    return (
                      <div key={h} title={`${h}:00 — ${count} withdrawals`} style={{
                        flex: 1, height: 20, borderRadius: 2,
                        background: `rgba(201,168,76,${0.08 + intensity * 0.92})`,
                        cursor: "default",
                      }} />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
                  <span className="text-xs dim">00:00</span>
                  <span className="text-xs dim">12:00</span>
                  <span className="text-xs dim">23:00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: RECONCILIATION ══════════════════════════════════════════ */}
      {tab === "reconciliation" && recon && (
        <div>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 className="serif" style={{ marginBottom: "0.25rem" }}>Financial Reconciliation</h2>
            <p className="text-xs dim">40/60 revenue split · 2% liquidity payout accounts</p>
          </div>

          {/* 40/60 Split */}
          <div className="panel--gold" style={{ marginBottom: "1.75rem" }}>
            <p className="panel-title" style={{ marginBottom: "0.75rem" }}>⚖️ Day-1 Fee Revenue Split</p>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "2rem", fontWeight: 800, color: "var(--gold-bright)" }}>{recon.split.fmanPct}%</p>
                <p className="text-xs dim">F-Man Share</p>
                <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>{recon.split.fmanShareNaira}</p>
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 1.5rem" }}>
                <div style={{ width: "100%", height: 16, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${recon.split.fmanPct}%`, background: "linear-gradient(90deg,var(--gold),#8A6F32)", borderRadius: 999 }} />
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-dim)" }}>{recon.split.networkPct}%</p>
                <p className="text-xs dim">Network Share</p>
                <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>{recon.split.networkShareNaira}</p>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between" }}>
              <span className="text-xs dim">Total Day-1 Fees Collected</span>
              <span style={{ fontWeight: 700, color: "var(--gold-bright)" }}>{recon.split.totalDay1FeesNaira}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.5rem" }}>
              <span className="text-xs dim">Total Accounts Onboarded</span>
              <span style={{ fontWeight: 700 }}>{recon.split.totalAccountsOnboarded.toLocaleString()}</span>
            </div>
          </div>

          {/* 2% Liquidity Accounts */}
          <div>
            <h3 className="serif" style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}>2% Liquidity Payout Accounts</h3>
            <p className="text-xs dim" style={{ marginBottom: "1rem" }}>Dedicated settlement accounts maintained at each approved partner bank</p>
            {recon.liquidityAccounts.length === 0 ? (
              <div className="notice notice--info"><span>ℹ</span>No approved banks yet — approve a bank application to see liquidity accounts.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {recon.liquidityAccounts.map(la => (
                  <div key={la.bankCode} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.6rem" }}>
                      <div>
                        <p style={{ fontWeight: 700, marginBottom: "0.2rem" }}>{la.bankName}</p>
                        <p className="mono text-xs dim">{la.bankCode}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--gold-bright)" }}>{la.balanceDisplay}</p>
                        <p className="text-xs dim">Available: {la.availableForCommissions}</p>
                      </div>
                    </div>
                    {/* Utilization bar */}
                    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 999, height: 6 }}>
                      <div style={{
                        height: "100%", borderRadius: 999,
                        width: `${la.percentUtilized}%`,
                        background: la.percentUtilized > 80
                          ? "linear-gradient(90deg,#ef4444,#fca5a5)"
                          : "linear-gradient(90deg,var(--gold-dim),var(--gold-bright))",
                        transition: "width 0.5s",
                      }} />
                    </div>
                    <p className="text-xs dim" style={{ marginTop: "0.3rem" }}>{la.percentUtilized}% utilized</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

