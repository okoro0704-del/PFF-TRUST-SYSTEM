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
