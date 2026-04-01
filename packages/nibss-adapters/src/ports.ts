import type { BiometricVerifyResult, MobileVerifyResult } from "./types";

/** FR-01 — BVN + fingerprint/face template to NIBSS FAS / VerifyNow-shaped API. */
export interface BiometricNibssPort {
  verifyFingerprint(bvnToken: string, template: Uint8Array): Promise<BiometricVerifyResult>;
  verifyFace(bvnToken: string, template: Uint8Array): Promise<BiometricVerifyResult>;
}

/** FR-02 — Mobile vs ICAD. */
export interface MobileIcadPort {
  verifyMobile(bvnToken: string, msisdn: string): Promise<MobileVerifyResult>;
}

export interface NibssAdapterBundle {
  biometric: BiometricNibssPort;
  mobile: MobileIcadPort;
}
