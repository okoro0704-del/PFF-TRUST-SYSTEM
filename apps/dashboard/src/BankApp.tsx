import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BankLandingPage, WhoWeArePage, WhatWeDoPage,
  GetConnectedPage, ContactPage, CorePage,
} from "./pages/BankLandingPage";
import { ZfoeOnboarding }   from "./pages/ZfoeOnboarding";
import { BihGateway }       from "./pages/BihGateway";
import { BlsWithdrawal }    from "./pages/BlsWithdrawal";
import { BlideGateway }     from "./pages/BlideGateway";
import { ZfpsMonitor }      from "./pages/ZfpsMonitor";
import { OnboardingStageA } from "./pages/OnboardingStageA";
import type { StageAData }  from "./pages/OnboardingStageA";
import { OnboardingStageB } from "./pages/OnboardingStageB";

type BankView =
  | "landing" | "who-we-are" | "what-we-do" | "get-connected" | "contact" | "core"
  | "apply-a" | "apply-b"
  | "zfoe" | "bih" | "bls" | "blide" | "zfps";

const CORE_VIEWS: BankView[] = ["core", "zfoe", "bih", "bls", "blide", "zfps"];

export function BankApp() {
  const navigate  = useNavigate();
  const [view, setView]           = useState<BankView>("landing");
  const [stageAData, setStageAData] = useState<StageAData | null>(null);

  const back = () => setView("landing");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ── Navbar ────────────────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="navbar__brand" onClick={back} style={{ cursor: "pointer" }}>
          <span className="navbar__logo">PFF</span>
          <div>
            <div className="navbar__title">PFF-TRUST SYSTEM</div>
            <div className="navbar__sub">Bank &amp; Fintech Portal</div>
          </div>
        </div>

        <div className="navbar__links">
          {/* ── Info tabs ── */}
          <button className={`btn btn--sm ${view === "who-we-are"  ? "btn--gold" : "btn--ghost"}`} onClick={() => setView("who-we-are")}>Who We Are</button>
          <button className={`btn btn--sm ${view === "what-we-do"  ? "btn--gold" : "btn--ghost"}`} onClick={() => setView("what-we-do")}>What We Do</button>
          <button className={`btn btn--sm ${["get-connected","apply-a","apply-b"].includes(view) ? "btn--gold" : "btn--ghost"}`} onClick={() => setView("get-connected")}>Get Connected</button>
          <button className={`btn btn--sm ${view === "contact"     ? "btn--gold" : "btn--ghost"}`} onClick={() => setView("contact")}>Contact</button>

          {/* ── Core services tab ── */}
          <button className={`btn btn--sm ${CORE_VIEWS.includes(view) ? "btn--gold" : "btn--outline"}`} onClick={() => setView("core")}>⚡ Core</button>

          {/* ── Divider + Admin ── */}
          <span style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 0.25rem" }} />
          <button className="btn btn--ghost btn--sm" onClick={() => navigate("/admin")} style={{ fontSize: "0.7rem", opacity: 0.55 }}>Admin →</button>
        </div>
      </nav>

      {/* ── Views ─────────────────────────────────────────────────────────── */}
      {view === "landing"       && <BankLandingPage onCore={() => setView("core")} onConnect={() => setView("get-connected")} />}
      {view === "who-we-are"    && <WhoWeArePage />}
      {view === "what-we-do"    && <WhatWeDoPage />}
      {view === "get-connected" && <GetConnectedPage onApply={() => setView("apply-a")} />}
      {view === "contact"       && <ContactPage />}
      {view === "core"          && (
        <CorePage
          onZfoe={()  => setView("zfoe")}
          onBih={()   => setView("bih")}
          onBls={()   => setView("bls")}
          onBlide={()  => setView("blide")}
          onZfps={()  => setView("zfps")}
        />
      )}

      {view === "apply-a" && (
        <OnboardingStageA
          onBack={() => setView("get-connected")}
          onSubmit={(data: StageAData) => { setStageAData(data); setView("apply-b"); }}
        />
      )}
      {view === "apply-b" && stageAData && (
        <OnboardingStageB stageAData={stageAData} onComplete={back} onBack={() => setView("apply-a")} />
      )}

      {view === "zfoe"  && <ZfoeOnboarding onBack={() => setView("core")} />}
      {view === "bih"   && <BihGateway     onBack={() => setView("core")} />}
      {view === "bls"   && <BlsWithdrawal  onBack={() => setView("core")} />}
      {view === "blide" && <BlideGateway   onBack={() => setView("core")} />}
      {view === "zfps"  && <ZfpsMonitor    onBack={() => setView("core")} />}

      {/* ── spacer so footer is always at the bottom ──────────────────────── */}
      <div style={{ flex: 1 }} />

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid var(--gold-border)",
        background: "var(--bg-surface)",
        padding: "2.5rem 2rem",
        textAlign: "center",
      }}>
        <p style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "1.05rem",
          fontWeight: 600,
          color: "var(--gold-bright)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: "0.5rem",
        }}>
          A Product of F-MAN TECHNOLOGIES
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-dim)", letterSpacing: "0.06em" }}>
          © {new Date().getFullYear()} F-Man Technologies Ltd. · PFF-TRUST is sovereign biometric infrastructure for Nigeria.
          · All rights reserved.
        </p>
      </footer>
    </div>
  );
}

