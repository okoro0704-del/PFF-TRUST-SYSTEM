import { MatchOutcome } from "@bsss/domain";
import type { BiometricNibssPort, MobileIcadPort } from "./ports";
import type { BiometricVerifyResult, MobileVerifyResult } from "./types";

function cid(): string {
  return `stub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface StubBehavior {
  fingerprint?: MatchOutcome;
  face?: MatchOutcome;
  mobile?: MatchOutcome;
}

export class StubBiometricNibss implements BiometricNibssPort {
  constructor(private readonly behavior: StubBehavior = {}) {}

  async verifyFingerprint(_bvn: string, _tpl: Uint8Array): Promise<BiometricVerifyResult> {
    return {
      correlationId: cid(),
      outcome: this.behavior.fingerprint ?? MatchOutcome.MatchFound,
      rawStatusCode: "STUB",
    };
  }

  async verifyFace(_bvn: string, _tpl: Uint8Array): Promise<BiometricVerifyResult> {
    return {
      correlationId: cid(),
      outcome: this.behavior.face ?? MatchOutcome.MatchFound,
      rawStatusCode: "STUB",
    };
  }
}

export class StubMobileIcad implements MobileIcadPort {
  constructor(private readonly behavior: StubBehavior = {}) {}

  async verifyMobile(_bvn: string, _msisdn: string): Promise<MobileVerifyResult> {
    return {
      correlationId: cid(),
      outcome: this.behavior.mobile ?? MatchOutcome.MatchFound,
      rawStatusCode: "STUB",
    };
  }
}

export function createStubNibssBundle(behavior?: StubBehavior): import("./ports").NibssAdapterBundle {
  return {
    biometric: new StubBiometricNibss(behavior),
    mobile: new StubMobileIcad(behavior),
  };
}
