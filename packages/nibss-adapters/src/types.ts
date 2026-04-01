import type { MatchOutcome } from "@bsss/domain";

export interface NibssCallMeta {
  correlationId: string;
  latencyMs?: number;
}

export interface BiometricVerifyResult extends NibssCallMeta {
  outcome: MatchOutcome;
  rawStatusCode?: string;
}

export interface MobileVerifyResult extends NibssCallMeta {
  outcome: MatchOutcome;
  rawStatusCode?: string;
}
