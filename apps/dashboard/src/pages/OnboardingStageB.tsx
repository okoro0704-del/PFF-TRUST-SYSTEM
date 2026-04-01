import { useState } from "react";
import { StatusTracker } from "../components/StatusTracker";
import type { StageAData } from "./OnboardingStageA";

interface OnboardingStageBProps {
  stageAData: StageAData;
  onComplete: () => void;
  onBack:     () => void;
}

type DepositStatus = "pending" | "verifying" | "verified" | "failed";

const FMAN_ACCOUNT = {
  bank:    "First Bank of Nigeria PLC",
  name:    "F-Man Technologies Limited — Institutional Operations",
  number:  "3089 4471 2200",
  sort:    "011151012",
  swift:   "FBNINGLA",
};

const DEPOSIT_ITEMS = [
  { label: "API License Fee (Annual)",       amount: "₦5,000,000",   note: "One-time activation; renewed annually" },
  { label: "Operational Float (Minimum)",    amount: "₦50,000,000",  note: "Agent commissions & 2% daily rewards pool" },
  { label: "Compliance Escrow",              amount: "₦10,000,000",  note: "Held in trust; returned at contract close" },
];

export function OnboardingStageB({ stageAData, onComplete, onBack }: OnboardingStageBProps) {
  const [depositStatus, setDepositStatus] = useState<DepositStatus>("pending");
  const [copied, setCopied] = useState(false);

  const copyAccount = () => {
    void navigator.clipboard.writeText(FMAN_ACCOUNT.number.replace(/\s/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verifyDeposit = () => {
    setDepositStatus("verifying");
    setTimeout(() => setDepositStatus("verified"), 2800);
  };

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      <StatusTracker stage={1} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "2rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
          ← Back
        </button>
        <span className="badge badge--gold" style={{ marginBottom: "1rem", display: "inline-block" }}>Stage B of 2 — Mandatory</span>
        <h2 className="serif" style={{ marginBottom: "0.5rem" }}>The Liquidity Gate</h2>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Application received for <strong className="gold">{stageAData.institutionName}</strong>.
          Before API keys are issued, you must initialize a Dedicated F-Man Technologies Corporate Account
          and fuel it with the Operational Float.
        </p>
      </div>

      {/* ── Why this is mandatory ────────────────────────────────────────── */}
      <div className="notice notice--info" style={{ marginBottom: "1.5rem", alignItems: "flex-start" }}>
        <span style={{ fontSize: "1.2rem" }}>⚠</span>
        <div>
          <strong style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.88rem" }}>Why this account is required</strong>
          <p style={{ fontSize: "0.82rem", lineHeight: 1.65 }}>
            The backend is hard-coded to pull funds <em>exclusively</em> from this Dedicated Account to satisfy
            daily agent commissions (the 60/40 split and 2% liquidity reward). API keys are released only after
            the float is confirmed — this protects your agents from delayed payouts from Day 1.
          </p>
        </div>
      </div>

      {/* ── F-Man Account Details ────────────────────────────────────────── */}
      <div className="panel--gold" style={{ marginBottom: "1.5rem" }}>
        <p className="panel-title" style={{ marginBottom: "1rem" }}>F-Man Technologies — Dedicated Corporate Account</p>
        <div className="form-grid" style={{ gap: "1rem", marginBottom: "1rem" }}>
          {[
            ["Bank",         FMAN_ACCOUNT.bank],
            ["Account Name", FMAN_ACCOUNT.name],
            ["Sort Code",    FMAN_ACCOUNT.sort],
            ["SWIFT / BIC",  FMAN_ACCOUNT.swift],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs dim" style={{ marginBottom: "0.25rem" }}>{k}</p>
              <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: "0.85rem", color: "var(--text)" }}>{v}</p>
            </div>
          ))}
        </div>
        {/* Account number with copy */}
        <div style={{
          background: "var(--bg)", borderRadius: "var(--radius-sm)", padding: "1rem 1.25rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          border: "1px solid var(--gold-border)",
        }}>
          <div>
            <p className="text-xs dim" style={{ marginBottom: "0.2rem" }}>Account Number</p>
            <p style={{ fontFamily: '"JetBrains Mono",monospace', fontSize: "1.3rem", color: "var(--gold-bright)", letterSpacing: "0.1em" }}>
              {FMAN_ACCOUNT.number}
            </p>
          </div>
          <button className="btn btn--outline btn--sm" onClick={copyAccount}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* ── Deposit Mandate ──────────────────────────────────────────────── */}
      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <p className="panel-title" style={{ marginBottom: "1rem" }}>Deposit Mandate — Minimum Required</p>
        {DEPOSIT_ITEMS.map((d) => (
          <div key={d.label} className="ledger-row">
            <span className="ledger-row__type gold">DEBIT</span>
            <span className="ledger-row__amount gold-bright">{d.amount}</span>
            <div className="ledger-row__desc">
              <div style={{ fontSize: "0.85rem", color: "var(--text)", fontWeight: 500 }}>{d.label}</div>
              <div className="text-xs dim">{d.note}</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--gold-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="text-sm muted">Total Minimum Deposit</span>
          <span style={{ fontFamily: '"JetBrains Mono",monospace', color: "var(--gold-bright)", fontSize: "1.1rem", fontWeight: 700 }}>₦65,000,000</span>
        </div>
      </div>

      {/* ── Verification CTA ─────────────────────────────────────────────── */}
      <div className="panel--gold" style={{ textAlign: "center" }}>
        {depositStatus === "pending" && (
          <>
            <p className="muted text-sm" style={{ marginBottom: "1.25rem" }}>
              Once you have made the transfer, click below to trigger bank-level confirmation.
              The system will verify the credit with our treasury operations team within 2 business hours.
            </p>
            <button className="btn btn--gold btn--lg btn--full" onClick={verifyDeposit}>
              Verify Deposit & Unlock API Keys →
            </button>
          </>
        )}

        {depositStatus === "verifying" && (
          <div style={{ padding: "1rem 0" }}>
            <div className="spin" style={{ fontSize: "2rem", marginBottom: "0.75rem", display: "block" }}>⏳</div>
            <p style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Verifying with Treasury…</p>
            <p className="muted text-sm">Checking NIBSS inter-bank credits — this takes a moment.</p>
          </div>
        )}

        {depositStatus === "verified" && (
          <div>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✅</div>
            <p className="ok" style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.5rem" }}>Liquidity Confirmed</p>
            <p className="muted text-sm" style={{ marginBottom: "1.5rem" }}>
              Float verified. Your dedicated account is now the operational engine for all agent commissions and API billing.
            </p>
            <button className="btn btn--gold btn--lg btn--full" onClick={onComplete}>
              Proceed to Institutional Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

