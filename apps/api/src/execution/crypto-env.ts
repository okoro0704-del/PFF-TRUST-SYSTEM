import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";

export function bvnHashFromConfig(config: ConfigService, bvn: string): string {
  const pepper = config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
  return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
}

export function cryptoSalt(config: ConfigService): Buffer {
  const s = config.get<string>("BSSS_CRYPTO_SALT") ?? "bsss-salt-change-in-prod-32b!!";
  return Buffer.from(s.padEnd(32, "0").slice(0, 32));
}

export function masterSecret(config: ConfigService): string {
  return config.get<string>("BSSS_MASTER_SECRET") ?? "dev-master-secret-32-characters!";
}

export function defaultShardRegion(config: ConfigService): string {
  return config.get<string>("SHARD_REGION") ?? "LAGOS";
}
