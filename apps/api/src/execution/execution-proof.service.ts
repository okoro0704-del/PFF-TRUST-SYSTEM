import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ProofPayload {
  sub: string;
  typ: "bvn" | "internal";
  exp: number;
  scopes: string[];
  /** Optional account the proof was minted for */
  ap?: string;
}

/** Stateless HMAC validation hash for follow-on execution requests (TTL configurable, default 90s). */
@Injectable()
export class ExecutionProofService {
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    return (
      this.config.get<string>("EXECUTION_PROOF_SECRET") ??
      this.config.get<string>("BSSS_MASTER_SECRET") ??
      "execution-proof-dev"
    );
  }

  mint(payload: Omit<ProofPayload, "exp"> & { expSec?: number }): string {
    const exp = Math.floor(Date.now() / 1000) + (payload.expSec ?? 120);
    const body: ProofPayload = {
      sub: payload.sub,
      typ: payload.typ,
      exp,
      scopes: payload.scopes,
      ap: payload.ap,
    };
    const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
    const sig = createHmac("sha256", this.secret()).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
  }

  verify(token: string, minScopes: string[], accountPublicRef?: string): ProofPayload {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) throw new UnauthorizedException("Invalid validation hash");
    const expect = createHmac("sha256", this.secret()).update(encoded).digest("base64url");
    const a = Buffer.from(expect);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException("Invalid validation hash signature");
    }
    let body: ProofPayload;
    try {
      body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ProofPayload;
    } catch {
      throw new UnauthorizedException("Invalid validation hash payload");
    }
    if (body.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException("Validation hash expired");
    }
    if (accountPublicRef && body.ap && body.ap !== accountPublicRef) {
      throw new UnauthorizedException("Validation hash account mismatch");
    }
    for (const s of minScopes) {
      if (!body.scopes?.includes(s)) throw new UnauthorizedException("Insufficient proof scope");
    }
    return body;
  }
}
