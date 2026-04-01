import { useState, useEffect, useCallback } from "react";

const API = "/api";

interface Pulse {
  todayCount: number; successCount: number; successRate: number;
  avgCbsLatencyMs: number; smsCount: number; smsRate: number;
  mandateMetCount: number; mandateMetRate: number;
  vaultMode: "LIVE" | "FALLBACK";
}
interface BankLatencyRow {
  bankCode: string; bankName: string; avgMs: number; minMs: number;
  maxMs: number; lastMs: number; callCount: number; alertCount: number;
  trafficLight: "GREEN" | "AMBER" | "RED" | "GREY";
}
interface LatencyDashboard { banks: BankLatencyRow[]; alertThresholdMs: number; windowHours: number; }
interface ProvisioningEvent {
  id: string; sessionRef: string; bankName: string; accountType: string;
  status: string; cbsLatencyMs: number | null; mandateMet: boolean | null;
  smsSentAt: string | null; smsDelivered: boolean | null; smsProvider: string | null;
  accountNumberMasked: string | null; createdAt: string;
}
interface SmsLog {
  id: string; recipient: string; messageType: string; provider: string;
  status: string; sentAt: string | null; createdAt: string;
}

const TRAFFIC_COLORS: Record<string, string> = {
  GREEN: "#22c55e", AMBER: "#f59e0b", RED: "#ef4444", GREY: "#6b7280",
};
const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#22c55e", PROVISIONING: "#3b82f6", FAILED: "#ef4444", VAULT_EXPIRED: "#f97316",
};
const SMS_STATUS_COLORS: Record<string, string> = {
  DELIVERED: "#22c55e", SENT: "#3b82f6", FAILED: "#ef4444",
};

const fmtMs = (ms: number | null) =>
  ms === null ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

export function ZfpsMonitor({ onBack }: { onBack: () => void }) {
  const [pulse,   setPulse]   = useState<Pulse | null>(null);
  const [latency, setLatency] = useState<LatencyDashboard | null>(null);
  const [events,  setEvents]  = useState<ProvisioningEvent[]>([]);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [pRes, lRes, eRes, sRes] = await Promise.all([
        fetch(`${API}/v1/zfps/pulse`),
        fetch(`${API}/v1/zfps/latency`),
        fetch(`${API}/v1/zfps/events?limit=15`),
        fetch(`${API}/v1/zfps/sms-log?limit=15`),
      ]);
      const [pData, lData, eData, sData] = await Promise.all([
        pRes.json() as Promise<Pulse>,
        lRes.json() as Promise<LatencyDashboard>,
        eRes.json() as Promise<ProvisioningEvent[]>,
        sRes.json() as Promise<SmsLog[]>,
      ]);
      setPulse(pData); setLatency(lData);
      setEvents(Array.isArray(eData) ? eData : []);
      setSmsLogs(Array.isArray(sData) ? sData : []);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", padding: "2rem", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ marginBottom: "2rem" }}>
        <div>
          <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "0.75rem" }}>← Back</button>
          <p className="panel-title" style={{ marginBottom: "0.25rem" }}>F-Man Technologies</p>
          <h1 className="serif" style={{ fontSize: "1.6rem", color: "var(--gold-bright)" }}>⚡ Zero-Friction Provisioning Stack</h1>
          <p className="text-xs dim">NIBSS → ISO 20022 → CBS → SMS · Sub-60s mandate · Redis NDPR vault</p>
        </div>
        <button className="btn btn--gold btn--sm" onClick={() => void load()} disabled={loading}>
          {loading ? <span className="spin">⏳</span> : "↻ Refresh"}
        </button>
      </div>

      {error && <div className="notice notice--bad" style={{ marginBottom: "1.5rem" }}><span>⚠</span>{error}</div>}

      {/* ISO 20022 + Redis info bar */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
        {[
          { icon: "📜", label: "Message Standard",   value: "ISO 20022 acmt.001.001.08" },
          { icon: "🔐", label: "Vault TTL",           value: "60 seconds (NDPR compliant)" },
          { icon: "🛡️", label: "Transit Encryption",  value: "AES-256-GCM + mTLS" },
          { icon: "📡", label: "NIBSS Protocol",      value: "gRPC / REST (env-switched)" },
          { icon: "📱", label: "SMS Rail",            value: "Termii API (auto-fallback stub)" },
        ].map(b => (
          <div key={b.label} style={{ flex: 1, minWidth: 160, background: "rgba(201,168,76,0.06)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.55rem 0.85rem" }}>
            <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--gold-bright)", marginBottom: "0.15rem" }}>{b.icon} {b.value}</p>
            <p className="text-xs dim">{b.label}</p>
          </div>
        ))}
      </div>

      {/* Pulse Strip */}
      {pulse && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "0.75rem", marginBottom: "2rem" }}>
          {[
            { label: "Today's Provisions",  value: pulse.todayCount,           color: "var(--text)" },
            { label: "Success Rate",        value: `${pulse.successRate}%`,     color: pulse.successRate >= 90 ? "#22c55e" : "#f59e0b" },
            { label: "Avg CBS Latency",     value: fmtMs(pulse.avgCbsLatencyMs), color: pulse.avgCbsLatencyMs < 5000 ? "#22c55e" : pulse.avgCbsLatencyMs < 20000 ? "#f59e0b" : "#ef4444" },
            { label: "SMS Delivery Rate",   value: `${pulse.smsRate}%`,         color: pulse.smsRate >= 90 ? "#22c55e" : "#f59e0b" },
            { label: "Mandate Met (<60s)",  value: `${pulse.mandateMetRate}%`,  color: pulse.mandateMetRate >= 95 ? "#22c55e" : "#f59e0b" },
            { label: "Redis Vault",         value: pulse.vaultMode,             color: pulse.vaultMode === "LIVE" ? "#22c55e" : "#f59e0b" },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "0.9rem 1rem" }}>
              <p style={{ fontSize: "1.3rem", fontWeight: 800, color: s.color, marginBottom: "0.2rem" }}>{s.value}</p>
              <p className="text-xs dim">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {/* Bank CBS Latency Dashboard */}
      {latency && (
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h2 className="serif" style={{ fontSize: "1.15rem" }}>📊 Bank CBS Latency Dashboard</h2>
            <span className="text-xs dim">Alert threshold: {(latency.alertThresholdMs / 1000).toFixed(0)}s · Last {latency.windowHours}h</span>
          </div>
          {latency.banks.length === 0 ? (
            <div className="notice notice--info"><span>ℹ</span>No CBS calls recorded yet — trigger a provisioning event to see latency data.</div>
          ) : (
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 70px 70px 70px 70px 60px 60px 80px", gap: "0.5rem", padding: "0.55rem 1rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)" }}>
                {["Bank","Avg","Min","Max","Last","Calls","Alerts","Status"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
              </div>
              {latency.banks.map(b => (
                <div key={b.bankCode} style={{ display: "grid", gridTemplateColumns: "1.5fr 70px 70px 70px 70px 60px 60px 80px", gap: "0.5rem", padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: "0.85rem" }}>{b.bankName}</p>
                    <p className="mono text-xs dim">{b.bankCode}</p>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "0.82rem", color: TRAFFIC_COLORS[b.trafficLight] }}>{fmtMs(b.avgMs)}</span>
                  <span className="text-xs dim">{fmtMs(b.minMs)}</span>
                  <span className="text-xs dim">{fmtMs(b.maxMs)}</span>
                  <span className="text-xs dim">{fmtMs(b.lastMs)}</span>
                  <span className="text-xs dim">{b.callCount}</span>
                  <span style={{ fontSize: "0.75rem", color: b.alertCount > 0 ? "#ef4444" : "var(--text-dim)", fontWeight: b.alertCount > 0 ? 700 : 400 }}>{b.alertCount > 0 ? `⚠ ${b.alertCount}` : "—"}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", fontWeight: 700, color: TRAFFIC_COLORS[b.trafficLight] }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: TRAFFIC_COLORS[b.trafficLight], display: "inline-block" }} />
                    {b.trafficLight}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Provisioning Events */}
      <div style={{ marginBottom: "2rem" }}>
        <h2 className="serif" style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>🔗 Recent Provisioning Events</h2>
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 80px 80px 90px 80px 90px", gap: "0.5rem", padding: "0.55rem 1rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)" }}>
            {["Session","Bank","Type","Status","CBS Time","Mandate","SMS"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
          </div>
          {events.length === 0
            ? <p className="text-xs dim" style={{ padding: "1.5rem", textAlign: "center" }}>No provisioning events yet — POST /v1/zfps/provision to trigger the pipeline.</p>
            : events.map(ev => (
              <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 80px 80px 90px 80px 90px", gap: "0.5rem", padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "0.68rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)" }}>{ev.sessionRef}</span>
                <div>
                  <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>{ev.bankName}</p>
                  <p className="text-xs dim">{new Date(ev.createdAt).toLocaleTimeString()}</p>
                </div>
                <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{ev.accountType}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: STATUS_COLORS[ev.status] ?? "#888" }}>{ev.status}</span>
                <span style={{ fontWeight: 700, fontSize: "0.82rem", color: (ev.cbsLatencyMs ?? 0) < 5000 ? "var(--ok)" : (ev.cbsLatencyMs ?? 0) < 20000 ? "#f59e0b" : "#ef4444" }}>{fmtMs(ev.cbsLatencyMs)}</span>
                <span style={{ fontSize: "0.72rem", color: ev.mandateMet ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{ev.mandateMet === null ? "—" : ev.mandateMet ? "✓ Met" : "✗ Missed"}</span>
                <span style={{ fontSize: "0.72rem", color: ev.smsDelivered ? "#22c55e" : ev.smsSentAt ? "#3b82f6" : "var(--text-dim)" }}>
                  {ev.smsSentAt ? (ev.smsDelivered ? `✓ ${ev.smsProvider ?? ""}` : `⏳ ${ev.smsProvider ?? ""}`) : "—"}
                </span>
              </div>
            ))
          }
        </div>
      </div>

      {/* SMS Delivery Log */}
      <div>
        <h2 className="serif" style={{ fontSize: "1.15rem", marginBottom: "0.75rem" }}>📱 SMS Delivery Log</h2>
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 80px 120px", gap: "0.5rem", padding: "0.55rem 1rem", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid var(--border)" }}>
            {["Recipient","Type","Provider","Status","Sent At"].map(h => <span key={h} className="text-xs dim">{h}</span>)}
          </div>
          {smsLogs.length === 0
            ? <p className="text-xs dim" style={{ padding: "1.5rem", textAlign: "center" }}>No SMS logs yet.</p>
            : smsLogs.map(s => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px 80px 120px", gap: "0.5rem", padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "0.75rem" }}>{s.recipient}</span>
                <span style={{ fontSize: "0.78rem" }}>{s.messageType.replace("_", " ")}</span>
                <span className="badge badge--dim" style={{ fontSize: "0.6rem" }}>{s.provider}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: SMS_STATUS_COLORS[s.status] ?? "#888" }}>
                  {s.status === "DELIVERED" ? "✓ " : s.status === "FAILED" ? "✗ " : "⏳ "}{s.status}
                </span>
                <span className="text-xs dim">{s.sentAt ? new Date(s.sentAt).toLocaleTimeString() : "—"}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

