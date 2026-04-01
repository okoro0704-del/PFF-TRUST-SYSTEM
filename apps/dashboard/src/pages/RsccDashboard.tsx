import { useState, useEffect, useCallback } from "react";

const API = "/api";
type Tab = "license" | "switching" | "ajo" | "liquidity";

// ── Types ─────────────────────────────────────────────────────────────────────
interface License { id: string; bankName: string; bankCode: string | null; licenseKey: string; status: string; daysRemaining: number; barPct: number; renewalFeeFmt: string; dedicatedBalanceFmt: string; licenseEndDateFmt: string; apiAccessRestricted: boolean; renewalConfirmedAt: string | null; }
interface SwitchingToll { id: string; sessionRef: string; sessionType: string; tollType: string; feeFmt: string; bankName: string | null; agentState: string | null; agentLga: string | null; tenMRuleApplied: boolean; createdAt: string; }
interface SwitchSummary { totalCalls: number; totalFeesFmt: string; todayCount: number; byType: Record<string, { count: number; feesFmt: string }>; heatmap24h: number[]; }
interface AjoAcct { id: string; accountRef: string; holderName: string; bankName: string; currentDay: number; cycleLengthDays: number; progressPct: number; progressLabel: string; day1FeeStatus: string; day1FeeDisplay: string; balanceDisplay: string; status: string; penaltyDisplay: string | null; }
interface AjoSummary { totalSavers: number; activeSavers: number; safeBreaks: number; pendingDay1Fees: number; totalDay1FeesCollectedFmt: string; totalTvlFmt: string; }
interface DailySplit { date: string; totalDay1FeesFmt: string; fmanShareFmt: string; agentPoolFmt: string; twoPercentFmt: string; rewardPerAgentFmt: string; totalAgents: number; fmanPct: number; agentPct: number; status: string; disbursedAt: string | null; }
interface DistRow { id: string; dateFmt: string; totalDay1FeesFmt: string; fmanShareFmt: string; agentPoolFmt: string; twoPercentFmt: string; status: string; disbursedAt: string | null; }
interface RedFlag { id: string; flagType: string; severity: string; bankName: string | null; bankCode: string | null; message: string; createdAt: string; }

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e", EXPIRING_SOON: "#f59e0b", SUSPENDED: "#ef4444", RENEWED: "#22c55e",
};
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#6b7280",
};
const FEE_STATUS_COLOR: Record<string, string> = {
  COLLECTED: "#22c55e", PENDING: "#f59e0b", FAILED: "#ef4444",
};
const AJO_STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#22c55e", COMPLETED: "#3b82f6", BROKEN: "#ef4444", SUSPENDED: "#6b7280",
};
const TOLL_ICONS: Record<string, string> = {
  NIBSS_YES_CALL: "📡", TRANSFER: "⚡", BILL_PAYMENT: "🧾", WITHDRAWAL: "💵",
};

const downloadCsv = async (url: string, filename: string) => {
  const res  = await fetch(url);
  const data = await res.json() as { csv: string; filename?: string };
  const blob = new Blob([data.csv], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = data.filename ?? filename; a.click();
};

export function RsccDashboard({ onBack }: { onBack: () => void }) {
  const [tab, setTab]             = useState<Tab>("license");
  const [licenses, setLicenses]   = useState<License[]>([]);
  const [licStats, setLicStats]   = useState<{ active: number; expiringSoon: number; suspended: number; totalRevenue: string } | null>(null);
  const [switchSum, setSwitchSum] = useState<SwitchSummary | null>(null);
  const [tolls, setTolls]         = useState<SwitchingToll[]>([]);
  const [tollFilter, setTollFilter] = useState("ALL");
  const [bankFilter, setBankFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [ajoList, setAjoList]     = useState<AjoAcct[]>([]);
  const [ajoSum, setAjoSum]       = useState<AjoSummary | null>(null);
  const [ajoSearch, setAjoSearch] = useState("");
  const [split, setSplit]         = useState<DailySplit | null>(null);
  const [dists, setDists]         = useState<DistRow[]>([]);
  const [flags, setFlags]         = useState<RedFlag[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qSwitch = new URLSearchParams();
      if (tollFilter && tollFilter !== "ALL") qSwitch.set("tollType", tollFilter);
      if (bankFilter)  qSwitch.set("bankCode",   bankFilter);
      if (stateFilter) qSwitch.set("agentState", stateFilter);

      const [lRes, sRes, tRes, aRes, asRes, dRes, dhRes, fRes] = await Promise.all([
        fetch(`${API}/v1/rscc/licenses`),
        fetch(`${API}/v1/rscc/switching?${qSwitch}`),
        fetch(`${API}/v1/rscc/switching/tolls?${qSwitch}`),
        fetch(`${API}/v1/rscc/ajo${ajoSearch ? `?search=${encodeURIComponent(ajoSearch)}` : ""}`),
        fetch(`${API}/v1/rscc/ajo/summary`),
        fetch(`${API}/v1/rscc/distribution`),
        fetch(`${API}/v1/rscc/distribution/history?days=7`),
        fetch(`${API}/v1/rscc/red-flags`),
      ]);
      const [lData, sData, tData, aData, asData, dData, dhData, fData] = await Promise.all([
        lRes.json() as Promise<{ stats: typeof licStats; licenses: License[] }>,
        sRes.json() as Promise<SwitchSummary>,
        tRes.json() as Promise<{ items: SwitchingToll[] }>,
        aRes.json() as Promise<{ accounts: AjoAcct[] }>,
        asRes.json() as Promise<AjoSummary>,
        dRes.json() as Promise<DailySplit | null>,
        dhRes.json() as Promise<{ distributions: DistRow[] }>,
        fRes.json() as Promise<{ flags: RedFlag[] }>,
      ]);
      setLicenses(lData.licenses ?? []); setLicStats(lData.stats ?? null);
      setSwitchSum(sData); setTolls(tData.items ?? []);
      setAjoList(aData.accounts ?? []); setAjoSum(asData);
      setSplit(dData); setDists(dhData.distributions ?? []);
      setFlags(fData.flags ?? []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [tollFilter, bankFilter, stateFilter, ajoSearch]);

  useEffect(() => { void load(); }, [load]);

  const confirmRenewal = async (id: string) => {
    setRenewingId(id);
    try {
      await fetch(`${API}/v1/rscc/licenses/${id}/renew`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedBy: "admin@fman.ng" }),
      });
      await load();
    } finally { setRenewingId(null); }
  };

  const resolveFlag = async (id: string) => {
    setResolvingId(id);
    try {
      await fetch(`${API}/v1/rscc/red-flags/${id}/resolve`, { method: "PATCH" });
      await load();
    } finally { setResolvingId(null); }
  };

  const criticalCount = flags.filter(f => f.severity === "CRITICAL").length;

  const TABS: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: "license",   label: "License Manager",  icon: "📋", badge: licStats?.suspended },
    { id: "switching", label: "Switching Ledger",  icon: "📡" },
    { id: "ajo",       label: "Ajo Registry",      icon: "🏺" },
    { id: "liquidity", label: "Liquidity Engine",  icon: "⚖️", badge: criticalCount },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <div>
          <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "0.75rem" }}>← Back</button>
          <p className="panel-title" style={{ marginBottom: "0.25rem" }}>F-Man Technologies</p>
          <h1 className="serif" style={{ fontSize: "1.6rem", color: "var(--gold-bright)" }}>💰 Revenue & Settlement Center</h1>
          <p className="text-xs dim">Triple-Stream Revenue Monitor · 60% Liquidity Distribution Engine</p>
        </div>
        <button className="btn btn--gold btn--sm" onClick={() => void load()} disabled={loading}>
          {loading ? <span className="spin">⏳</span> : "↻ Refresh"}
        </button>
      </div>

      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* Critical red-flag banner */}
      {criticalCount > 0 && (
        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid #ef4444", borderRadius: "var(--radius)", padding: "0.75rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", animation: "pulse 2s ease-in-out infinite" }}>
          <span style={{ fontSize: "1.25rem" }}>🚨</span>
          <span style={{ fontWeight: 700, color: "#ef4444" }}>{criticalCount} CRITICAL Alert{criticalCount > 1 ? "s" : ""}</span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-dim)" }}>— Dedicated account balance below 48h payout threshold. Immediate action required.</span>
          <button className="btn btn--sm" style={{ marginLeft: "auto", fontSize: "0.7rem" }} onClick={() => setTab("liquidity")}>→ View Alerts</button>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem", borderBottom: "1px solid var(--border)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "0.6rem 1.1rem", background: "none", border: "none", position: "relative",
            borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
            color: tab === t.id ? "var(--gold-bright)" : "var(--text-dim)",
            fontWeight: tab === t.id ? 700 : 400, cursor: "pointer", fontSize: "0.88rem",
          }}>
            {t.icon} {t.label}
            {(t.badge ?? 0) > 0 && <span style={{ position: "absolute", top: 4, right: 2, background: "#ef4444", color: "#fff", borderRadius: 999, fontSize: "0.58rem", padding: "0 5px", fontWeight: 800, lineHeight: "16px", minWidth: 16, textAlign: "center" }}>{t.badge}</span>}
          </button>
        ))}
      </div>
      {/* ════ TAB: LICENSE MANAGER ════════════════════════════════════════ */}
      {tab === "license" && (
        <div>
          {/* Summary chips */}
          {licStats && (
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              {[
                { label: "Active",        value: licStats.active,       color: "#22c55e" },
                { label: "Expiring Soon", value: licStats.expiringSoon,  color: "#f59e0b" },
                { label: "Suspended",     value: licStats.suspended,     color: "#ef4444" },
                { label: "Total Revenue", value: licStats.totalRevenue,  color: "var(--gold-bright)" },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.5rem 1rem", flex: 1, minWidth: 110 }}>
                  <p style={{ fontWeight: 800, fontSize: "1.3rem", color: s.color }}>{s.value}</p>
                  <p className="text-xs dim">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "1rem" }}>
            {licenses.map(lic => {
              const col = STATUS_COLOR[lic.status] ?? "#888";
              const isActionable = lic.status === "SUSPENDED" || lic.status === "EXPIRING_SOON";
              return (
                <div key={lic.id} style={{ background: "var(--bg-panel)", border: `1px solid ${isActionable ? col + "55" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "1.25rem" }}>
                  {/* Bank + status badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: "1rem", marginBottom: "0.2rem" }}>{lic.bankName}</p>
                      <p className="mono text-xs dim">{lic.bankCode ?? "—"}</p>
                    </div>
                    <span style={{ padding: "0.25rem 0.65rem", borderRadius: 999, background: col + "20", color: col, fontSize: "0.7rem", fontWeight: 800 }}>{lic.status.replace("_", " ")}</span>
                  </div>

                  {/* T-Minus countdown bar */}
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                      <span className="text-xs dim">T-Minus</span>
                      <span style={{ fontWeight: 800, fontSize: "1.15rem", color: col, fontFamily: '"JetBrains Mono",monospace' }}>
                        {lic.daysRemaining}<span style={{ fontSize: "0.7rem", fontWeight: 400 }}> / 31 days</span>
                      </span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 10, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 999, transition: "width 0.5s",
                        width: `${lic.barPct}%`,
                        background: lic.status === "SUSPENDED" ? "#ef4444"
                          : lic.status === "EXPIRING_SOON"     ? "#f59e0b"
                          : "linear-gradient(90deg,#16a34a,#22c55e)",
                      }} />
                    </div>
                    <p className="text-xs dim" style={{ marginTop: "0.3rem" }}>Expires: {lic.licenseEndDateFmt}</p>
                  </div>

                  {/* License details */}
                  {[
                    ["License Key",         lic.licenseKey.split("-").slice(0, 3).join("-") + "…"],
                    ["Renewal Fee",          lic.renewalFeeFmt],
                    ["Dedicated A/C Bal",    lic.dedicatedBalanceFmt],
                    ["API Access",           lic.apiAccessRestricted ? "🔴 Restricted" : "🟢 Active"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0", borderBottom: "1px solid var(--border)" }}>
                      <span className="text-xs dim">{k}</span>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: k === "API Access" && lic.apiAccessRestricted ? "#ef4444" : "var(--text)" }}>{v}</span>
                    </div>
                  ))}

                  {/* Confirm Renewal button */}
                  {isActionable && (
                    <button className="btn btn--gold btn--sm btn--full" style={{ marginTop: "0.9rem" }}
                      onClick={() => void confirmRenewal(lic.id)} disabled={renewingId === lic.id}>
                      {renewingId === lic.id ? <><span className="spin">⏳</span> Processing…</> : "✓ Confirm Renewal (₦500,000)"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "1.25rem" }}>
            <button className="btn btn--ghost btn--sm" onClick={() => void downloadCsv(`${API}/v1/rscc/export/licenses`, "licenses.csv")}>
              ↓ Export Licenses CSV (CBN/NIBSS)
            </button>
          </div>
        </div>
      )}

      {/* ════ TAB: SWITCHING LEDGER ════════════════════════════════════════ */}
      {tab === "switching" && (
        <div>
          {/* Summary bar */}
          {switchSum && (
            <div style={{ display: "flex", gap: "0.65rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              {[
                { icon: "📡", label: "Total YES Calls", value: switchSum.totalCalls },
                { icon: "💰", label: "Total Fees",       value: switchSum.totalFeesFmt },
                { icon: "📅", label: "Today",            value: switchSum.todayCount },
                ...Object.entries(switchSum.byType).map(([k, v]) => ({ icon: TOLL_ICONS[k] ?? "•", label: k.replace("_", " "), value: `${v.count} · ${v.feesFmt}` })),
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.9rem", flex: 1, minWidth: 120 }}>
                  <p style={{ fontWeight: 800, fontSize: "1rem", color: "var(--gold-bright)" }}>{s.icon} {s.value}</p>
                  <p className="text-xs dim">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* 24h heatmap */}
          {switchSum && (
            <div style={{ marginBottom: "1.5rem" }}>
              <p className="text-xs dim" style={{ marginBottom: "0.4rem" }}>24h Volume Heatmap</p>
              <div style={{ display: "flex", gap: "2px" }}>
                {switchSum.heatmap24h.map((c, h) => {
                  const mx  = Math.max(...switchSum.heatmap24h, 1);
                  return <div key={h} title={`${h}:00 — ${c} calls`} style={{ flex: 1, height: 28, borderRadius: 2, background: `rgba(201,168,76,${0.06 + (c / mx) * 0.94})`, cursor: "default" }} />;
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="text-xs dim">00:00</span><span className="text-xs dim">12:00</span><span className="text-xs dim">23:00</span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
            {["ALL", "NIBSS_YES_CALL", "TRANSFER", "BILL_PAYMENT", "WITHDRAWAL"].map(t => (
              <button key={t} onClick={() => setTollFilter(t)} style={{
                padding: "0.3rem 0.75rem", borderRadius: 999, fontSize: "0.72rem",
                background: tollFilter === t ? "var(--gold)" : "var(--bg-panel)",
                color: tollFilter === t ? "#0C0C10" : "var(--text-dim)",
                border: "1px solid var(--border)", cursor: "pointer", fontWeight: tollFilter === t ? 700 : 400,
              }}>{TOLL_ICONS[t] ?? ""} {t.replace("_", " ")}</button>
            ))}
            <input className="form-input" placeholder="Bank code…" value={bankFilter} onChange={e => setBankFilter(e.target.value)} style={{ width: 130, padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} />
            <input className="form-input" placeholder="State…" value={stateFilter} onChange={e => setStateFilter(e.target.value)} style={{ width: 110, padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} />
            <button className="btn btn--ghost btn--sm" onClick={() => void downloadCsv(`${API}/v1/rscc/export/switching`, "switching.csv")}>↓ CSV</button>
          </div>

          {/* Toll table */}
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 90px 90px 60px", gap: "0.5rem", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
              {["Session Ref","Type","Bank","State","Fee","Date","10m"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
            </div>
            {tolls.length === 0
              ? <p className="text-xs dim" style={{ padding: "1.5rem", textAlign: "center" }}>No records match filter</p>
              : tolls.map(t => (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px 90px 90px 60px", gap: "0.5rem", padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sessionRef}</span>
                  <span style={{ fontSize: "0.75rem" }}>{TOLL_ICONS[t.tollType] ?? ""} {t.tollType.replace("_CALL","").replace("_"," ")}</span>
                  <span style={{ fontSize: "0.75rem" }}>{t.bankName ?? "—"}</span>
                  <span className="text-xs dim">{t.agentState ?? "—"}</span>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--gold-bright)" }}>{t.feeFmt}</span>
                  <span className="text-xs dim">{new Date(t.createdAt).toLocaleDateString()}</span>
                  <span style={{ fontSize: "0.7rem", color: t.tenMRuleApplied ? "var(--ok)" : "var(--text-dim)" }}>{t.tenMRuleApplied ? "✓ Yes" : "—"}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ════ TAB: AJO REGISTRY ════════════════════════════════════════════ */}
      {tab === "ajo" && (
        <div>
          {/* Search + Summary */}
          <div style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
            <input className="form-input" placeholder="Search by name, bank, or account ref…" value={ajoSearch}
              onChange={e => setAjoSearch(e.target.value)} style={{ flex: 1, minWidth: 260, padding: "0.5rem 0.9rem" }} />
            <button className="btn btn--ghost btn--sm" onClick={() => void downloadCsv(`${API}/v1/rscc/export/ajo`, "ajo.csv")}>↓ Export CSV</button>
          </div>

          {ajoSum && (
            <div style={{ display: "flex", gap: "0.65rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              {[
                { label: "Total Savers",       value: ajoSum.totalSavers,                     color: "var(--text)" },
                { label: "Active",             value: ajoSum.activeSavers,                    color: "#22c55e" },
                { label: "Safe Breaks",        value: ajoSum.safeBreaks,                      color: "#ef4444" },
                { label: "Pending Day-1",      value: ajoSum.pendingDay1Fees,                 color: "#f59e0b" },
                { label: "Day-1 Collected",    value: ajoSum.totalDay1FeesCollectedFmt,        color: "var(--gold-bright)" },
                { label: "Total TVL",          value: ajoSum.totalTvlFmt,                     color: "var(--gold-bright)" },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.9rem", flex: 1, minWidth: 110 }}>
                  <p style={{ fontWeight: 800, fontSize: "1.05rem", color: s.color }}>{s.value}</p>
                  <p className="text-xs dim">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ajo table */}
          <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 80px 1.6fr 90px 90px 70px", gap: "0.5rem", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
              {["Account","Holder","Bank","Day Progress","Day-1 Fee","Balance","Status"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
            </div>
            {ajoList.map(a => (
              <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 80px 1.6fr 90px 90px 70px", gap: "0.5rem", padding: "0.6rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "0.72rem" }}>{a.accountRef}</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{a.holderName}</span>
                <span className="text-xs dim">{a.bankName}</span>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-dim)" }}>{a.progressLabel}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--gold-bright)", fontWeight: 700 }}>{a.progressPct}%</span>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 999, height: 5 }}>
                    <div style={{ height: "100%", width: `${a.progressPct}%`, borderRadius: 999, background: a.status === "BROKEN" ? "#ef4444" : "linear-gradient(90deg,var(--gold-dim),var(--gold-bright))", transition: "width 0.4s" }} />
                  </div>
                </div>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: FEE_STATUS_COLOR[a.day1FeeStatus] ?? "#888" }}>{a.day1FeeStatus === "COLLECTED" ? "✓ " : a.day1FeeStatus === "PENDING" ? "⏳ " : "✗ "}{a.day1FeeDisplay}</span>
                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "var(--ok)" }}>{a.balanceDisplay}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: AJO_STATUS_COLOR[a.status] ?? "#888" }}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ════ TAB: LIQUIDITY ENGINE ════════════════════════════════════════ */}
      {tab === "liquidity" && (
        <div>
          {/* Red-Flag Alerts */}
          {flags.length > 0 && (
            <div style={{ marginBottom: "1.75rem" }}>
              <h3 className="serif" style={{ marginBottom: "0.75rem", color: "#ef4444" }}>🚨 Admin Red-Flag Alerts ({flags.length})</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {flags.map(f => (
                  <div key={f.id} style={{ background: `${SEVERITY_COLOR[f.severity] ?? "#888"}11`, border: `1px solid ${SEVERITY_COLOR[f.severity] ?? "#888"}44`, borderRadius: "var(--radius)", padding: "0.9rem 1.1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.72rem", color: SEVERITY_COLOR[f.severity], padding: "0.2rem 0.5rem", borderRadius: 999, background: `${SEVERITY_COLOR[f.severity]}20` }}>{f.severity}</span>
                        <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{f.flagType.replace(/_/g, " ")}</span>
                        {f.bankName && <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{f.bankName}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <span className="text-xs dim">{new Date(f.createdAt).toLocaleString()}</span>
                        <button className="btn btn--ghost btn--sm" style={{ fontSize: "0.65rem", padding: "0.2rem 0.5rem" }}
                          onClick={() => void resolveFlag(f.id)} disabled={resolvingId === f.id}>
                          {resolvingId === f.id ? "…" : "✓ Resolve"}
                        </button>
                      </div>
                    </div>
                    <p style={{ fontSize: "0.83rem", color: "var(--text)" }}>{f.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's 40/60 Split */}
          {split && (
            <div className="panel--gold" style={{ marginBottom: "1.75rem" }}>
              <p className="panel-title" style={{ marginBottom: "0.75rem" }}>⚖️ Today's Day-1 Fee Distribution — {split.date}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "1rem" }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "2rem", fontWeight: 800, color: "var(--gold-bright)" }}>{split.fmanPct}%</p>
                  <p className="text-xs dim">F-Man</p>
                  <p style={{ fontWeight: 700 }}>{split.fmanShareFmt}</p>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 999, height: 14, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${split.fmanPct}%`, background: "linear-gradient(90deg,var(--gold),#8A6F32)", borderRadius: 999 }} />
                  </div>
                  <p style={{ textAlign: "center", fontSize: "0.8rem", marginTop: "0.4rem", color: "var(--text-dim)" }}>Total Day-1 Fees: <strong style={{ color: "var(--gold-bright)" }}>{split.totalDay1FeesFmt}</strong></p>
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-dim)" }}>{split.agentPct}%</p>
                  <p className="text-xs dim">Agent Pool</p>
                  <p style={{ fontWeight: 700 }}>{split.agentPoolFmt}</p>
                </div>
              </div>

              {/* 2% Reward Tracker */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem" }}>
                <p className="text-xs dim" style={{ marginBottom: "0.6rem" }}>2% Daily Reward Pool — Agent Wallet Credits</p>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  {[
                    ["2% Pool Total",     split.twoPercentFmt,    "var(--gold-bright)"],
                    ["Per Agent Credit",  split.rewardPerAgentFmt,"var(--ok)"],
                    ["Total Agents",      split.totalAgents,      "var(--text)"],
                    ["Disburse Status",   split.status === "DISBURSED" ? "✓ Disbursed" : "⏳ Pending", split.status === "DISBURSED" ? "#22c55e" : "#f59e0b"],
                  ].map(([k, v, c]) => (
                    <div key={String(k)} style={{ flex: 1, minWidth: 120, background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.8rem" }}>
                      <p style={{ fontWeight: 700, color: String(c), fontSize: "1rem" }}>{v}</p>
                      <p className="text-xs dim">{k}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Distribution History */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="serif" style={{ fontSize: "1.1rem" }}>7-Day Distribution History</h3>
              <button className="btn btn--ghost btn--sm" onClick={() => void downloadCsv(`${API}/v1/rscc/export/distribution`, "distribution.csv")}>↓ Export CSV</button>
            </div>
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1.2fr 1fr 1fr 1fr 100px", gap: "0.5rem", padding: "0.5rem 1rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)" }}>
                {["Date","Total Day-1","F-Man 40%","Agent 60%","2% Pool","Status"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
              </div>
              {dists.map(d => (
                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "90px 1.2fr 1fr 1fr 1fr 100px", gap: "0.5rem", padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: "0.75rem" }}>{d.dateFmt}</span>
                  <span style={{ fontWeight: 700, color: "var(--gold-bright)", fontSize: "0.82rem" }}>{d.totalDay1FeesFmt}</span>
                  <span style={{ fontSize: "0.8rem" }}>{d.fmanShareFmt}</span>
                  <span style={{ fontSize: "0.8rem" }}>{d.agentPoolFmt}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--ok)" }}>{d.twoPercentFmt}</span>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: d.status === "DISBURSED" ? "#22c55e" : "#f59e0b" }}>
                    {d.status === "DISBURSED" ? "✓ Disbursed" : "⏳ Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

