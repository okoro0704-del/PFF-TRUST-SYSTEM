import { randomUUID } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import type { BiometricNibssPort, MobileIcadPort } from "./ports";
import type { BiometricVerifyResult, MobileVerifyResult } from "./types";

export interface HttpNibssConfig {
  baseUrl: string;
  fasPath?: string;
  verifyNowPath?: string;
  icadPath?: string;
  apiKey?: string;
  timeoutMs?: number;
}

function mapHttpToOutcome(status: number): MatchOutcome {
  if (status >= 200 && status < 300) return MatchOutcome.MatchFound;
  if (status === 404) return MatchOutcome.NoMatch;
  return MatchOutcome.Error;
}

/**
 * HTTP placeholders for live NIBSS — wire real paths/JSON per NIBSS PDFs.
 * Env: NIBSS_BASE_URL, NIBSS_API_KEY (optional until sandbox).
 */
export class HttpBiometricNibss implements BiometricNibssPort {
  constructor(private readonly cfg: HttpNibssConfig) {}

  async verifyFingerprint(bvnToken: string, template: Uint8Array): Promise<BiometricVerifyResult> {
    const path = this.cfg.fasPath ?? "/fas/v1/fingerprint/verify";
    return this.postBiometric(path, bvnToken, template);
  }

  async verifyFace(bvnToken: string, template: Uint8Array): Promise<BiometricVerifyResult> {
    const path = this.cfg.verifyNowPath ?? "/verifynow/v1/face/verify";
    return this.postBiometric(path, bvnToken, template);
  }

  private async postBiometric(
    path: string,
    bvnToken: string,
    template: Uint8Array,
  ): Promise<BiometricVerifyResult> {
    const url = new URL(path, this.cfg.baseUrl);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 2500);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          bvnToken,
          templateB64: Buffer.from(template).toString("base64"),
        }),
      });
      return {
        correlationId: res.headers.get("x-correlation-id") ?? randomUUID(),
        outcome: mapHttpToOutcome(res.status),
        rawStatusCode: String(res.status),
      };
    } catch {
      return {
        correlationId: randomUUID(),
        outcome: MatchOutcome.Error,
        rawStatusCode: "NETWORK",
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export class HttpMobileIcad implements MobileIcadPort {
  constructor(private readonly cfg: HttpNibssConfig) {}

  async verifyMobile(bvnToken: string, msisdn: string): Promise<MobileVerifyResult> {
    const path = this.cfg.icadPath ?? "/icad/v1/mobile/verify";
    const url = new URL(path, this.cfg.baseUrl);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.cfg.timeoutMs ?? 2500);
    try {
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({ bvnToken, msisdn }),
      });
      return {
        correlationId: res.headers.get("x-correlation-id") ?? randomUUID(),
        outcome: mapHttpToOutcome(res.status),
        rawStatusCode: String(res.status),
      };
    } catch {
      return {
        correlationId: randomUUID(),
        outcome: MatchOutcome.Error,
        rawStatusCode: "NETWORK",
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export function createHttpNibssBundle(cfg: HttpNibssConfig): import("./ports").NibssAdapterBundle {
  return {
    biometric: new HttpBiometricNibss(cfg),
    mobile: new HttpMobileIcad(cfg),
  };
}
