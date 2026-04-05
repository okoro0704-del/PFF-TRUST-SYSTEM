# ♛ F-Man Sovereign SDK v1.0.0
### The Biometric Identity & Ajo Settlement Layer

> **"Every transaction authorised. Every identity verified. Every naira accounted for."**

[![Version](https://img.shields.io/badge/version-1.0.0-gold)](./version.txt)
[![License](https://img.shields.io/badge/license-Proprietary%20%2F%20All%20Rights%20Reserved-red)](./LICENSE)
[![CBN Compliant](https://img.shields.io/badge/CBN-Agent%20Banking%20Compliant-green)](https://cbn.gov.ng)
[![NIBSS](https://img.shields.io/badge/NIBSS-BVN%20%2F%20NIN%20Integrated-blue)](https://nibss-plc.com.ng)

---

## Overview

The **F-Man Sovereign SDK** is a CBN-compliant biometric identity and settlement layer built by
**PFF-TRUST**. It gives licensed Nigerian financial institutions a single integration point for:

- **13 sovereign biometric functions** — account opening, face pay, liquidity sweeps, agent management
- **BSSS** (Biometric System Security Standard) — the protocol that ensures raw biometric data
  *never* leaves the user's device
- **SSA / Ajo Protocol** — the 31-day sovereign savings-and-settlement cycle
- **Verified Business Profile Gate** — every SDK host must be CBN-licensed and biometrically verified
  before any function activates

> **Access is by sovereign licence only.**
> Banks, fintechs, and POS operators apply via the Kingmaker Partner portal.

---

## Prerequisites

| Requirement | Minimum |
|---|---|
| Node.js | ≥ 20 LTS |
| React | ≥ 18.0 |
| PostgreSQL | ≥ 15 (via Supabase or self-hosted) |
| CBN Agent Banking Licence | Mandatory |
| PFF-TRUST Sovereign API Key | Issued on approval |

---

## Installation

### Option A — Private NPM Registry (Approved Partner)

```bash
# Configure the PFF-TRUST private registry (one-time)
npm config set @bsss:registry https://registry.pff-trust.ng

# Install the SDK
npm install @bsss/fman-sdk
```

### Option B — Direct Embed (CDN / Script Tag)

```html
<!-- Place in <head> before your app bundle -->
<script
  src="https://cdn.pff-trust.ng/sdk/fman-sovereign-1.0.0.min.js"
  integrity="sha384-[HASH_PROVIDED_IN_PARTNER_PORTAL]"
  crossorigin="anonymous">
</script>
```

### Option C — Monorepo (Internal / Self-Hosted)

```bash
git clone https://github.com/pff-trust/fman-sovereign-sdk
cd fman-sovereign-sdk
npm install
npm run build
```

---

## Initialisation

```typescript
import { FMan } from '@bsss/fman-sdk';

// Called once at application root — before any feature is used.
// apiKey is your Sovereign Licence Key issued by the PFF-TRUST admin portal.
await FMan.init({
  apiKey:    'sk_sovereign_XXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  hostAppId: 'your-bank-portal',          // Must match your registered hostAppId
  env:       'production',                // 'sandbox' | 'production'
  onVerified: (profile) => {
    console.log(`♛ SDK Unlocked for: ${profile.businessName}`);
  },
  onBlocked: (reason) => {
    console.error(`🔒 SDK Blocked: ${reason}`);
  },
});
```

### React Provider (Recommended for SPA)

```tsx
import { UnifiedSDKProvider } from '@bsss/fman-sdk/react';

// Wrap your application root
export default function App() {
  return (
    <UnifiedSDKProvider apiKey="sk_sovereign_XXXX" hostAppId="your-bank-portal">
      <YourBankApplication />
    </UnifiedSDKProvider>
  );
}
```

### Launch a Function

```typescript
import { usePFFTrust } from '@bsss/fman-sdk/react';

function PayButton() {
  const { launch } = usePFFTrust();

  return (
    <button onClick={() =>
      launch({
        fn: 'YES_CALL',                       // Biometric transaction gate
        cfg: {
          hostAppId:   'your-bank-portal',
          ref:         'TXN-20260405-001',
          amount:      50000,                 // in Naira
          beneficiary: 'Zenith Bank — 0123456789',
          narration:   'Salary payment',
          onSuccess:   (result) => console.log('Token:', result.successToken),
          onAbort:     ()       => console.log('Cancelled'),
        },
      })
    }>
      Pay with Fingerprint
    </button>
  );
}
```

> When `launch()` is called, the Sovereign SDK **force-injects** its UI over the entire host
> application at `z-index: 99999`. The host app's interface is invisible until the function
> completes or the user biometrically confirms an abort.

---

## Modules & Functions

### 🛡️ BSSS Biometrics — Biometric System Security Standard

The BSSS protocol guarantees: **raw biometric data never leaves the user's device.**
Only a cryptographically signed `SUCCESS_TOKEN` (SHA-256, 32-byte random seed) is
returned to the host application.

| ID | Function | Description |
|---|---|---|
| `BAS` | Biometric Account Setup | 10-finger enrollment + NIBSS BVN/NIN verification. Creates Tier-1 or Tier-3 accounts. |
| `BIH` | Biometric Identity Harvest | Triple-gate: fingerprint + liveness challenge + NIN cross-reference via NIBSS. |
| `BLS` | Biometric Liquidity Sweep | Biometric-gated fund sweep with NIBSS real-time settlement. |
| `BLIDE` | Biometric Face Pay | Facial recognition payment — 1:1 match, no PIN required. |
| `YES_CALL` | Biometric Transaction Gate | Signed transaction authorisation. Returns `SUCCESS_TOKEN` only. Max 2 retries before block. |
| `BEPWG` | Proximity Withdrawal Gate | GPS-verified withdrawal — must be within approved radius of terminal. |
| `LBAS` | Live Biometric Auth System | Anti-spoofing dual-gate: randomised liveness challenge (7 types) + 6-digit TOTP. 30s time limit. |

```typescript
// Example: Biometric Identity Harvest
launch({
  fn: 'BIH',
  cfg: {
    hostAppId:  'your-bank-portal',
    sessionRef: 'KYC-SESSION-20260405',
    onSuccess:  (r) => saveToKyc(r.successToken),
  },
});
```

---

### 💰 SSA / Ajo Protocol — Secured Saving Account

The **31-Day Sovereign Savings Cycle** — a biometrically sealed savings account with a
built-in penalty-break mechanism to enforce saving discipline.

| ID | Function | Description |
|---|---|---|
| `SSA` | Secured Saving Account | 31-day biometric lock. Ajo-Signature fingerprint. SVG ring progress display. |
| `ZFOE` | Zero-Friction Account Opening | Opens a bank account in under 60 seconds via NIBSS. No paperwork. |
| `ZFPS` | Zero-Friction Provisioning | Provisions 6 NIBSS/CBN services in sequence: BVN link, NIN sync, KYC, NUBAN, mandate, limits. |
| `UNWP` | Unbanked Withdrawal Protocol | Cognitive TOTP + offline POS ledger + biometric release for unbanked users. |

**Ajo Rules enforced at the SDK layer (not overridable by host app):**

- **Day 1–30:** Funds are `SOVEREIGN_RESTRICTED` — biometric re-entry required for any access attempt
- **Early Break:** Mandatory 10-minute cooling-off countdown + 50% penalty deducted automatically
- **Day 31:** Funds become `SOVEREIGN_ACTIVE` — withdrawal with single biometric scan

```typescript
// Example: Open an Ajo Safe
launch({
  fn: 'SSA',
  cfg: {
    hostAppId:    'your-bank-portal',
    targetAmount: 100000,       // ₦100,000 savings goal
    onSuccess:    (r) => console.log('Ajo ID:', r.ajoId),
  },
});
```

---

### 🏢 CAC Business Verification — Verified Business Profile Gate

Every host application must complete a **one-time 4-step business verification** before
any SDK function can be launched. The gate is force-injected automatically.

| Step | Action | API Endpoint |
|---|---|---|
| 1 | Business Name + CAC Registration Number | `POST /v1/sdk/profile/register` |
| 2 | Director Biometric (fingerprint) | `PATCH /v1/sdk/profile/:id/biometric` |
| 3 | CBN Agent Banking Licence Reference | `PATCH /v1/sdk/profile/:id/verify` |
| 4 | **♛ VERIFIED** — all 13 functions unlock | Session token issued |

```typescript
// Status is checked silently on every launch() call
const { profile } = usePFFTrust();

if (profile?.verified) {
  console.log(`Business: ${profile.businessName}`);
  console.log(`Verified: ${profile.verifiedAt}`);
} else {
  console.log('Gate will auto-inject on next launch()');
}
```

---

### 🤝 KYA — Know Your Agent

```typescript
// Example: Link a Sub-Agent
launch({
  fn: 'KYA',
  cfg: {
    hostAppId:     'your-bank-portal',
    masterAgentId: 'MA-001',
    onSuccess:     (r) => console.log('Sub-Agent SS-ID:', r.agentLinked),
  },
});
```

### ♛ Kingmaker — Sovereign Vault Partner Application

```typescript
// Example: Apply to receive sovereign AJO deposits
launch({
  fn: 'KINGMAKER',
  cfg: {
    hostAppId: 'your-bank-portal',
    onSuccess: (r) => console.log('Partner Ref:', r.partnerRef),
  },
});
```

---

## Environment Variables

Create a `.env` file from `.env.example`. **Never commit `.env`.**

```bash
cp apps/api/.env.example apps/api/.env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Supabase recommended) |
| `BSSS_MASTER_SECRET` | ✅ | 64-hex-char master key for AES-256-GCM NUBAN encryption |
| `BVN_PEPPER` | ✅ | 64-hex-char HMAC pepper for BVN hashing |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `NIBSS_API_KEY` | ✅ | NIBSS BVN/NIN verification API key |
| `TERMII_API_KEY` | ⚠️ | SMS OTP provider (required for ZFOE) |
| `REDIS_URL` | ⚠️ | Redis for rate limiting and session caching |
| `NODE_ENV` | ✅ | `production` \| `sandbox` |

---

## API Reference

Base URL: `https://api.pff-trust.ng/v1`

| Method | Route | Description |
|---|---|---|
| `POST` | `/sdk/profile/register` | Register a new business profile |
| `PATCH` | `/sdk/profile/:id/biometric` | Submit director biometric (step 2) |
| `PATCH` | `/sdk/profile/:id/verify` | Admin: verify profile |
| `PATCH` | `/sdk/profile/:id/suspend` | Admin: suspend profile |
| `GET` | `/sdk/profile/check?hostAppId=` | Gate check — called on every launch |
| `POST` | `/kingmaker/partners/apply` | Apply for Sovereign Vault Partnership |
| `PATCH` | `/kingmaker/partners/:code/approve` | Admin: approve partner |
| `GET` | `/kingmaker/metrics` | LMR dashboard metrics |
| `POST` | `/zfoe/open` | Zero-friction account opening |
| `POST` | `/bih/harvest` | Biometric identity harvest |
| `POST` | `/bls/sweep` | Biometric liquidity sweep |
| `POST` | `/kya/sub-agents` | Link a sub-agent |

Full Swagger documentation available at `/api/docs` when running locally.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOST APPLICATION (Bank / POS)                │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         F-Man Sovereign SDK (force-injected)            │   │
│   │                                                         │   │
│   │  ♛ BusinessProfileGate ──► Verified Business Profile   │   │
│   │         │                                               │   │
│   │         ▼                                               │   │
│   │  ┌─────────────────────────────────────────────────┐   │   │
│   │  │  SovereignOverlay  (z-index: 99999)             │   │   │
│   │  │  backdrop-blur · non-dismissible                │   │   │
│   │  │                                                 │   │   │
│   │  │  F01 BAS  │ F02 ZFOE │ F03 BIH │ F04 BLS      │   │   │
│   │  │  F05 BLIDE│ F06 ZFPS │ F07 YES │ F08 SSA       │   │   │
│   │  │  F09 BEPWG│ F10 LBAS │ F11 UNWP│ F12 KYA       │   │   │
│   │  │  F13 KINGMAKER                                  │   │   │
│   │  └─────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              PFF-TRUST API (NestJS + PostgreSQL)
              NIBSS · CBN · Supabase · BSSS Protocol
```

---

## Compliance & Security

| Standard | Status |
|---|---|
| CBN Agent Banking Guidelines | ✅ Compliant |
| NIBSS BVN Verification | ✅ Integrated |
| NIN Cross-Reference | ✅ Integrated |
| BSSS (Biometric System Security Standard) | ✅ Native |
| AES-256-GCM NUBAN Encryption | ✅ Enforced |
| HMAC-SHA256 BVN Hashing | ✅ Enforced |
| Raw Biometric Data Storage | 🚫 Strictly Prohibited |
| Private Key Git Exposure | 🚫 Blocked by .gitignore |

---

## Licensing & Partner Onboarding

This SDK is **proprietary software**. Access requires:

1. A valid **CBN Agent Banking Licence**
2. Approval through the **Kingmaker Sovereign Partner Portal**
3. A signed **PFF-TRUST Partner Agreement**
4. A **Sovereign API Key** (annual renewal: ₦500,000)

To apply: [https://bank.pff-trust.ng → Get Connected → ♛ Join the Table](https://bank.pff-trust.ng)

---

## Support

| Channel | Details |
|---|---|
| Partner Portal | https://bank.pff-trust.ng |
| Admin Dashboard | https://admin.pff-trust.ng |
| Technical Support | api@pff-trust.ng |
| CBN Compliance | compliance@pff-trust.ng |

---

> © 2026 PFF-TRUST. All Rights Reserved.
> Proprietary software — unauthorised distribution is a violation of the PFF-TRUST Partner Agreement and applicable Nigerian law.
> See [LICENSE](./LICENSE) for full terms.

