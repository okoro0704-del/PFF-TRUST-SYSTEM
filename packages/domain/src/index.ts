/** Triple-Gate verification channels. */
export enum BiometricGate {
  Fingerprint = "fingerprint",
  Face = "face",
  Mobile = "mobile",
}

/** Normalized match outcome from NIBSS-shaped adapters. */
export enum MatchOutcome {
  MatchFound = "match_found",
  NoMatch = "no_match",
  Error = "error",
}

/** PFF Trust vs high-value (Sentinel) flow. */
export enum TransactionPolicyMode {
  /** FR-04: any one gate Yes confirms. */
  OrGate = "or_gate",
  /** FR-05: at least two Yes gates required. */
  AndGate = "and_gate",
}

export interface GateMatchResult {
  gate: BiometricGate;
  outcome: MatchOutcome;
  correlationId?: string;
}

export interface SentinelThresholdResponse {
  /** Amount above which AND-gate applies (minor units / smallest currency). */
  andGateThresholdMinorUnits: bigint;
  currencyCode: string;
}

export interface TripleGatePayload {
  fingerprintTemplate?: Uint8Array;
  faceTemplate?: Uint8Array;
  mobileNumber?: string;
}

export interface VerificationContext {
  transactionAmountMinorUnits: bigint;
  currencyCode: string;
  externalTransactionId: string;
}
