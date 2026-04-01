import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SentinelThresholdResponse } from "@bsss/domain";

/** Fetches high-value threshold from Sentinel (stub or HTTP). */
@Injectable()
export class SentinelService {
  constructor(private readonly config: ConfigService) {}

  async getThreshold(_currencyCode: string): Promise<SentinelThresholdResponse> {
    const sentinelBase = this.config.get<string>("SENTINEL_BASE_URL");
    if (sentinelBase) {
      try {
        const url = new URL("/v1/thresholds/and-gate", sentinelBase);
        const res = await fetch(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(1500),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            andGateThresholdMinorUnits: string;
            currencyCode: string;
          };
          return {
            andGateThresholdMinorUnits: BigInt(body.andGateThresholdMinorUnits),
            currencyCode: body.currencyCode,
          };
        }
      } catch {
        /* fall through to stub */
      }
    }
    const fallback = this.config.get<string>("SENTINEL_AND_GATE_THRESHOLD_MINOR") ?? "10000000";
    return {
      andGateThresholdMinorUnits: BigInt(fallback),
      currencyCode: this.config.get<string>("DEFAULT_CURRENCY") ?? "NGN",
    };
  }

  /**
   * After 3 failed POS unlock attempts: Sentinel stealth capture + GPS alert.
   * POST to Sentinel when configured; otherwise logs (dev).
   */
  async reportStealthCaptureAndGpsAlert(payload: {
    terminalId: string;
    agentBvnHash: string;
    consecutiveFailures: number;
    latitude?: number;
    longitude?: number;
    gatesTried: { fingerprint: boolean; face: boolean; mobile: boolean };
    outcomes?: { fingerprint?: string; face?: string; mobile?: string };
  }): Promise<{ reported: boolean }> {
    const base = this.config.get<string>("SENTINEL_BASE_URL");
    const fullUrl = this.config.get<string>("SENTINEL_STEALTH_URL");
    const path = this.config.get<string>("SENTINEL_STEALTH_PATH") ?? "/v1/pos/stealth-capture";
    const target =
      fullUrl ??
      (base ? `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}` : null);
    if (target) {
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            terminalId: payload.terminalId,
            agentBvnHash: payload.agentBvnHash,
            gps:
              payload.latitude != null && payload.longitude != null
                ? { lat: payload.latitude, lng: payload.longitude }
                : undefined,
            consecutiveFailures: payload.consecutiveFailures,
            gatesTried: payload.gatesTried,
            outcomes: payload.outcomes,
          }),
          signal: AbortSignal.timeout(5000),
        });
        return { reported: res.ok };
      } catch {
        /* fall through */
      }
    }
    console.warn("[Sentinel][stealth] stub — would notify GPS/stealth", JSON.stringify(payload));
    return { reported: false };
  }

  /**
   * BVN Consecutive-Failure Rate Limiter alert.
   *
   * Called by VerificationService when a BVN hash has accumulated ≥ N consecutive
   * failed confirmations within the rolling window. Sends to Sentinel's
   * /v1/bvn/excessive-failures endpoint when SENTINEL_BASE_URL is configured;
   * falls back to a structured warning log in dev.
   */
  async reportBvnConsecutiveFailures(payload: {
    bvnHash: string;
    orgId: string;
    consecutiveFailures: number;
    windowMinutes: number;
    lastExternalTransactionId: string;
  }): Promise<{ reported: boolean }> {
    const base = this.config.get<string>("SENTINEL_BASE_URL");
    const path = "/v1/bvn/excessive-failures";
    const target = base ? `${base.replace(/\/$/, "")}${path}` : null;

    if (target) {
      try {
        const res = await fetch(target, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bvnHash:                   payload.bvnHash,
            orgId:                     payload.orgId,
            consecutiveFailures:       payload.consecutiveFailures,
            windowMinutes:             payload.windowMinutes,
            lastExternalTransactionId: payload.lastExternalTransactionId,
            reportedAt:                new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000),
        });
        return { reported: res.ok };
      } catch {
        /* fall through to stub */
      }
    }

    console.warn(
      "[Sentinel][bvn-rate-limit] stub — would alert on excessive BVN failures",
      JSON.stringify(payload),
    );
    return { reported: false };
  }
}
