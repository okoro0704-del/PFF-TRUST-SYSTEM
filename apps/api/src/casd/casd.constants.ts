// ─── Bank Application Status ──────────────────────────────────────────────────
export const CASD_PENDING_REVIEW          = "PENDING_REVIEW";
export const CASD_VERIFICATION_IN_PROGRESS= "VERIFICATION_IN_PROGRESS";
export const CASD_APPROVED               = "APPROVED";
export const CASD_REJECTED               = "REJECTED";

/** Ordered stages for the 3-stage advance toggle */
export const CASD_STATUS_PIPELINE = [
  CASD_PENDING_REVIEW,
  CASD_VERIFICATION_IN_PROGRESS,
  CASD_APPROVED,
] as const;

// ─── Bank Document Types (uploaded by FI) ────────────────────────────────────
export const BDOC_CBN_LICENSE         = "CBN_LICENSE";
export const BDOC_BOG_LICENSE         = "BOG_LICENSE";
export const BDOC_CORPORATE_REG       = "CORPORATE_REG";
export const BDOC_BIOMETRIC_SIGNATORY = "BIOMETRIC_SIGNATORY";
export const BDOC_TAX_CLEARANCE       = "TAX_CLEARANCE";
export const BDOC_OTHER               = "OTHER";

// ─── Sovereign Document Types (F-Man vault) ───────────────────────────────────
export const SVDOC_CAC_INCORPORATION  = "CAC_INCORPORATION";
export const SVDOC_DIRECTORS_BIOMETRIC= "DIRECTORS_BIOMETRIC";
export const SVDOC_DIRECTORS_ID       = "DIRECTORS_ID";
export const SVDOC_TAX_CLEARANCE      = "TAX_CLEARANCE";
export const SVDOC_OPERATIONAL_PERMIT = "OPERATIONAL_PERMIT";
export const SVDOC_NDIC_REGISTRATION  = "NDIC_REGISTRATION";

// ─── Push Delivery Status ─────────────────────────────────────────────────────
export const PUSH_QUEUED = "QUEUED";
export const PUSH_SENT   = "SENT";
export const PUSH_FAILED = "FAILED";

// ─── Bank Category ────────────────────────────────────────────────────────────
export const BANK_CAT_COMMERCIAL   = "COMMERCIAL";
export const BANK_CAT_MICROFINANCE = "MICROFINANCE";
export const BANK_CAT_MOBILE_MONEY = "MOBILE_MONEY";
export const BANK_CAT_COOPERATIVE  = "COOPERATIVE";

// ─── Reconciliation ───────────────────────────────────────────────────────────
/** F-Man share of Day-1 fees */
export const SPLIT_FMAN_PCT    = 40;
/** Agent/partner network share of Day-1 fees */
export const SPLIT_NETWORK_PCT = 60;
/** 2% of transaction volume held in dedicated accounts for daily commissions */
export const LIQUIDITY_PCT     = 2;
/** Day-1 account setup fee in kobo (₦500) */
export const DAY1_FEE_MINOR    = 50_000;
/** Ajo (Secured Saving) safe-break penalty as a percentage of principal */
export const AJO_SAFE_BREAK_PCT = 50;

// ─── Sovereign Vault Seed Data ────────────────────────────────────────────────
export const SOVEREIGN_VAULT_SEED = [
  {
    documentType:     SVDOC_CAC_INCORPORATION,
    documentName:     "Certificate of Incorporation — F-Man Technologies Ltd",
    issuingAuthority: "Corporate Affairs Commission (CAC Nigeria)",
    issueDate:        new Date("2023-01-15"),
    expiryDate:       null,
    documentHash:     "a3f9e2d1c7b84056f1ea29c3d5b6a7e84f3c9201b5d7a6e2f0c4b8d2e1a3f9b7",
  },
  {
    documentType:     SVDOC_DIRECTORS_BIOMETRIC,
    documentName:     "Directors' Biometric Data — Isreal Okoro & Partners",
    issuingAuthority: "NIMC / NIBSS National Identity Management",
    issueDate:        new Date("2023-02-01"),
    expiryDate:       null,
    documentHash:     "b7c2e1d4a8f5091723bc46d9e3a7c1f85b2d9e4a7c6f3b0d1e8a2f9c7b4e3d0",
  },
  {
    documentType:     SVDOC_DIRECTORS_ID,
    documentName:     "Directors' BVN & NIN Records — Verified by NIBSS",
    issuingAuthority: "NIBSS / NIMC",
    issueDate:        new Date("2023-02-01"),
    expiryDate:       null,
    documentHash:     "c5d8f2a1b4e7093c16ab49d8f2e5c3a9b7d4f1e6c8a3b0d9f2e5c7a4b1d8f3c0",
  },
  {
    documentType:     SVDOC_TAX_CLEARANCE,
    documentName:     "Tax Clearance Certificate FY 2024",
    issuingAuthority: "Federal Inland Revenue Service (FIRS)",
    issueDate:        new Date("2024-01-10"),
    expiryDate:       new Date("2025-01-09"),
    documentHash:     "d1e4c7b2a5f8093b17dc4ae9f3b6c1d8a5e2f9b4c7a0d3e6f1b8c5a2d9f6e3b0",
  },
  {
    documentType:     SVDOC_OPERATIONAL_PERMIT,
    documentName:     "Fintech Operations & Payment Service Permit",
    issuingAuthority: "Central Bank of Nigeria (CBN)",
    issueDate:        new Date("2023-06-15"),
    expiryDate:       new Date("2026-06-14"),
    documentHash:     "e8f3b6a9c2d5071824eb57fa2c9d4b1e8f5a3c0b7d4e1a8f2c9b6d3e0a7f4c1b8",
  },
  {
    documentType:     SVDOC_NDIC_REGISTRATION,
    documentName:     "NDIC Deposit Insurance Registration Certificate",
    issuingAuthority: "Nigeria Deposit Insurance Corporation (NDIC)",
    issueDate:        new Date("2023-08-01"),
    expiryDate:       null,
    documentHash:     "f2c5a8d1e4b7093a16dc29ef4b7c2d5a8f1e4b7c0d3a6f9b2e5c8a1d4f7b0e3c6",
  },
] as const;

