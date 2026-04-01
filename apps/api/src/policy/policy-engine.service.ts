import { Injectable } from "@nestjs/common";
import { BiometricGate, MatchOutcome, TransactionPolicyMode, type GateMatchResult } from "@bsss/domain";

@Injectable()
export class PolicyEngineService {
  isYes(outcome: MatchOutcome): boolean {
    return outcome === MatchOutcome.MatchFound;
  }

  decidePolicyMode(amountMinor: bigint, thresholdMinor: bigint): TransactionPolicyMode {
    return amountMinor >= thresholdMinor ? TransactionPolicyMode.AndGate : TransactionPolicyMode.OrGate;
  }

  /** FR-04 / FR-05 */
  aggregateConfirm(mode: TransactionPolicyMode, results: GateMatchResult[]): boolean {
    const yes = results.filter((r) => r.outcome === MatchOutcome.MatchFound).length;
    if (mode === TransactionPolicyMode.OrGate) return yes >= 1;
    return yes >= 2;
  }

  /** Sentinel alert: mixed signals (at least one Yes and one definitive No). */
  detectMismatch(results: GateMatchResult[]): boolean {
    const yes = results.some((r) => r.outcome === MatchOutcome.MatchFound);
    const no = results.some((r) => r.outcome === MatchOutcome.NoMatch);
    return yes && no;
  }

  gatesFromTriples(
    fp: MatchOutcome,
    face: MatchOutcome,
    mobile: MatchOutcome,
  ): GateMatchResult[] {
    return [
      { gate: BiometricGate.Fingerprint, outcome: fp },
      { gate: BiometricGate.Face, outcome: face },
      { gate: BiometricGate.Mobile, outcome: mobile },
    ];
  }
}
