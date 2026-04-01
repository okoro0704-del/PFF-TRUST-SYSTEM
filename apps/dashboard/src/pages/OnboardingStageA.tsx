import { useState } from "react";
import { StatusTracker } from "../components/StatusTracker";

interface OnboardingStageAProps {
  onSubmit: (data: StageAData) => void;
  onBack:   () => void;
}

export interface StageAData {
  institutionName: string;
  cbnLicenseNo:    string;
  jurisdiction:    string;
  rcNumber:        string;
  incorporationDate: string;
  infraSummary:    string;
  signatoryName:   string;
  signatoryRole:   string;
  signatoryBvn:    string;
  signatoryEmail:  string;
}

export function OnboardingStageA({ onSubmit, onBack }: OnboardingStageAProps) {
  const [form, setForm] = useState<StageAData>({
    institutionName: "", cbnLicenseNo: "", jurisdiction: "CBN",
    rcNumber: "", incorporationDate: "", infraSummary: "",
    signatoryName: "", signatoryRole: "", signatoryBvn: "", signatoryEmail: "",
  });
  const [errors, setErrors] = useState<Partial<StageAData>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof StageAData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const validate = (): boolean => {
    const e: Partial<StageAData> = {};
    if (!form.institutionName.trim()) e.institutionName = "Required";
    if (!form.cbnLicenseNo.trim())   e.cbnLicenseNo    = "Required";
    if (!form.rcNumber.trim())       e.rcNumber        = "Required";
    if (!form.signatoryName.trim())  e.signatoryName   = "Required";
    if (!form.signatoryBvn.match(/^[0-9]{11}$/)) e.signatoryBvn = "Must be 11 digits";
    if (!form.signatoryEmail.match(/^[^@]+@[^@]+\.[^@]+$/)) e.signatoryEmail = "Invalid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); onSubmit(form); }, 1200);
  };

  const Field = ({ id, label, type = "text", hint, required = true }: {
    id: keyof StageAData; label: string; type?: string; hint?: string; required?: boolean;
  }) => (
    <div className="form-group">
      <label className="form-label">{label}{required && <span>*</span>}</label>
      <input
        type={type} className="form-input" value={form[id]}
        onChange={set(id)} placeholder={hint}
      />
      {errors[id] && <p className="form-error">⚠ {errors[id]}</p>}
    </div>
  );

  return (
    <div className="container--narrow" style={{ padding: "3rem 2rem" }}>
      <StatusTracker stage={0} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "2.5rem" }}>
        <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ marginBottom: "1.5rem" }}>
          ← Back to Gateway
        </button>
        <span className="badge badge--gold" style={{ marginBottom: "1rem", display: "inline-block" }}>Stage A of 2</span>
        <h2 className="serif" style={{ marginBottom: "0.5rem" }}>Access Application</h2>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Submit your regulatory credentials and authorized biometric signatory details.
          All fields are encrypted in transit (TLS 1.3) and stored with AES-256-GCM.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Section 1: Regulatory Licenses ─────────────────────────────── */}
        <div className="form-section">
          <p className="form-section__title">Regulatory Licenses</p>
          <div className="form-grid">
            <Field id="institutionName" label="Institution Name" hint="First Bank of Nigeria PLC" />
            <Field id="cbnLicenseNo"   label="CBN / BoG License Number" hint="CBN-LIC-00123" />
          </div>
          <div className="form-group">
            <label className="form-label">Licensing Jurisdiction <span>*</span></label>
            <select className="form-select" value={form.jurisdiction} onChange={set("jurisdiction")}>
              <option value="CBN">Nigeria — Central Bank of Nigeria (CBN)</option>
              <option value="BOG">Ghana — Bank of Ghana (BoG)</option>
              <option value="GLOBAL">Multi-Jurisdiction / Global</option>
              <option value="OTHER">Other Sovereign Framework</option>
            </select>
          </div>
        </div>

        {/* ── Section 2: Corporate Registration ──────────────────────────── */}
        <div className="form-section">
          <p className="form-section__title">Corporate Registration</p>
          <div className="form-grid">
            <Field id="rcNumber"          label="RC / Company Number"    hint="RC 1234567" />
            <Field id="incorporationDate" label="Date of Incorporation"  type="date" hint="" required={false} />
          </div>
        </div>

        {/* ── Section 3: Technical Infrastructure ────────────────────────── */}
        <div className="form-section">
          <p className="form-section__title">Technical Infrastructure Overview</p>
          <div className="form-group">
            <label className="form-label">Infrastructure Summary <span>*</span></label>
            <textarea
              className="form-textarea" value={form.infraSummary} onChange={set("infraSummary")}
              placeholder="Describe your current POS fleet, core banking system (CBS), cloud provider, data residency compliance, and API integration experience…"
              style={{ minHeight: 110 }}
            />
            <p className="form-hint">Include POS terminal count, CBS vendor, and whether you operate in LAGOS or ACCRA data shards.</p>
          </div>
        </div>

        {/* ── Section 4: Authorized Biometric Signatory ──────────────────── */}
        <div className="form-section">
          <p className="form-section__title">Authorized Biometric Signatory</p>
          <div className="notice notice--info" style={{ marginBottom: "1.25rem" }}>
            <span>🔒</span>
            <span style={{ fontSize: "0.82rem" }}>
              This individual will be required to pass a Face/Fingerprint NIBSS gate before
              accessing sensitive liquidity data in the institutional dashboard.
            </span>
          </div>
          <div className="form-grid">
            <Field id="signatoryName"  label="Full Legal Name"    hint="Adaora Okafor" />
            <Field id="signatoryRole"  label="Role / Designation" hint="Chief Technology Officer" />
            <Field id="signatoryBvn"   label="BVN (11 digits)"    hint="12345678901" />
            <Field id="signatoryEmail" label="Official Email"      type="email" hint="signatory@bank.ng" />
          </div>
        </div>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <div className="panel--gold" style={{ padding: "1.5rem", textAlign: "center" }}>
          <p className="muted text-sm" style={{ marginBottom: "1.25rem" }}>
            By submitting, you confirm that all information is accurate and that your institution
            accepts the F-Man Technologies API Licensing Terms and Biometric Data Processing Agreement.
          </p>
          <button type="submit" className="btn btn--gold btn--lg btn--full" disabled={submitting}>
            {submitting ? "⏳ Submitting Application…" : "Submit Access Application →"}
          </button>
        </div>
      </form>
    </div>
  );
}

