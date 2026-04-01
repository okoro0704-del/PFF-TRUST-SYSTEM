import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { decryptPayload, unpackEncryptedBlob } from "@bsss/crypto";
import { cryptoSalt, masterSecret } from "./crypto-env";

/**
 * Production: route template compare through HSM / secure enclave RPC.
 * Dev: decrypt with app key (never expose raw biometrics to application logs).
 */
@Injectable()
export class HsmBiometricService {
  constructor(private readonly config: ConfigService) {}

  async secureTemplateMatch(storedPacked: Buffer, candidate: Buffer): Promise<boolean> {
    if (!candidate?.length) return false;
    const salt = cryptoSalt(this.config);
    const secret = masterSecret(this.config);
    const blob = unpackEncryptedBlob(storedPacked);
    let reference: Buffer;
    try {
      reference = decryptPayload(blob, secret, salt);
    } catch {
      return false;
    }
    if (reference.length !== candidate.length) return false;
    return timingSafeEqual(reference, candidate);
  }

  async secureMobileMatch(storedPacked: Buffer, msisdn: string): Promise<boolean> {
    const salt = cryptoSalt(this.config);
    const secret = masterSecret(this.config);
    const blob = unpackEncryptedBlob(storedPacked);
    let plain: Buffer;
    try {
      plain = decryptPayload(blob, secret, salt);
    } catch {
      return false;
    }
    const n = msisdn.replace(/\s/g, "");
    const ref = plain.toString("utf8").replace(/\s/g, "");
    const a = Buffer.from(ref, "utf8");
    const b = Buffer.from(n, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
