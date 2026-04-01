import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createStubNibssBundle,
  createHttpNibssBundle,
  type NibssAdapterBundle,
  type StubBehavior,
} from "@bsss/nibss-adapters";
import { MatchOutcome } from "@bsss/domain";

@Injectable()
export class NibssFactory {
  constructor(private readonly config: ConfigService) {}

  create(): NibssAdapterBundle {
    const baseUrl = this.config.get<string>("NIBSS_BASE_URL");
    if (baseUrl) {
      return createHttpNibssBundle({
        baseUrl,
        apiKey: this.config.get<string>("NIBSS_API_KEY"),
        timeoutMs: Number(this.config.get("NIBSS_TIMEOUT_MS")) || 2500,
        fasPath: this.config.get<string>("NIBSS_FAS_PATH"),
        verifyNowPath: this.config.get<string>("NIBSS_VERIFY_NOW_PATH"),
        icadPath: this.config.get<string>("NIBSS_ICAD_PATH"),
      });
    }
    const behavior = this.parseStubBehavior();
    return createStubNibssBundle(behavior);
  }

  private parseStubBehavior(): StubBehavior | undefined {
    const fp = this.config.get<string>("STUB_NIBSS_FP");
    const face = this.config.get<string>("STUB_NIBSS_FACE");
    const mobile = this.config.get<string>("STUB_NIBSS_MOBILE");
    if (!fp && !face && !mobile) return undefined;
    const map = (v?: string): MatchOutcome | undefined => {
      if (!v) return undefined;
      if (v === "match") return MatchOutcome.MatchFound;
      if (v === "nomatch") return MatchOutcome.NoMatch;
      if (v === "error") return MatchOutcome.Error;
      return undefined;
    };
    return { fingerprint: map(fp), face: map(face), mobile: map(mobile) };
  }
}
