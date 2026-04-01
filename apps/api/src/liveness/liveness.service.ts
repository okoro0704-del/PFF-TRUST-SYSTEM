import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface LivenessPort {
  verifyPassive(faceImageOrTemplate: Uint8Array): Promise<{ pass: boolean; score?: number }>;
}

/** Stubbed passive liveness; swap for vendor SDK / API in production. */
@Injectable()
export class StubLivenessService implements LivenessPort {
  constructor(private readonly config: ConfigService) {}

  async verifyPassive(_payload: Uint8Array): Promise<{ pass: boolean; score?: number }> {
    if (this.config.get<string>("LIVENESS_BYPASS") === "true") {
      return { pass: true, score: 1 };
    }
    // Minimal heuristic placeholder: non-empty payload passes when not bypassed — replace with real model
    if (!_payload?.length) {
      throw new BadRequestException("Face payload required for liveness");
    }
    return { pass: true, score: 0.92 };
  }
}
