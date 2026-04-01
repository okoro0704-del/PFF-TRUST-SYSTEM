import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHmac,
  randomBytes, timingSafeEqual,
} from "node:crypto";
import { OFFLINE_CACHE_TTL_HOURS, PROXIMITY_RADIUS_M } from "./bepwg.constants";

export interface OfflineCachePayload {
  customerBvnHash: string;
  latitudeDeg:     number;
  longitudeDeg:    number;
  generatedAt:     string;   // ISO-8601
  validUntil:      string;   // ISO-8601
}

export interface ProximityResult {
  withinProximity: boolean;
  distanceM:       number;
}

/**
 * ProximityService — Haversine-based 10m Rule + AES-256-GCM offline cache.
 *
 * Online path:  server calculates proximity against LocationAnchor coordinates.
 * Offline path: POS decrypts local cache, checks proximity on-device, presents
 *               the HMAC-signed token. Server re-validates the HMAC + TTL.
 */
@Injectable()
export class ProximityService {
  constructor(private readonly config: ConfigService) {}

  /** WGS-84 Haversine great-circle distance in metres. */
  haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R   = 6_371_000; // Earth mean radius in metres
    const φ1  = lat1 * (Math.PI / 180);
    const φ2  = lat2 * (Math.PI / 180);
    const Δφ  = (lat2 - lat1) * (Math.PI / 180);
    const Δλ  = (lon2 - lon1) * (Math.PI / 180);
    const a   = Math.sin(Δφ / 2) ** 2
              + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  checkProximity(
    deviceLat: number, deviceLon: number,
    anchorLat: number, anchorLon: number,
    radiusM = PROXIMITY_RADIUS_M,
  ): ProximityResult {
    const distanceM = this.haversineM(deviceLat, deviceLon, anchorLat, anchorLon);
    return { withinProximity: distanceM <= radiusM, distanceM };
  }

  // ── Offline Cache — AES-256-GCM encrypted coordinate blob for POS storage ──

  private cacheKey(): Buffer {
    const secret = this.config.get<string>("OFFLINE_CACHE_SECRET") ?? "offline-cache-secret-32-chars!!";
    return Buffer.from(secret.padEnd(32, "0").slice(0, 32));
  }

  private hmacSecret(): string {
    return this.config.get<string>("OFFLINE_CACHE_HMAC_SECRET") ?? "offline-hmac-secret-change-in-prod";
  }

  /**
   * Generate the AES-256-GCM encrypted offline cache blob stored in LocationAnchor.
   * The POS decrypts this locally using OFFLINE_CACHE_SECRET to obtain coordinates.
   */
  generateOfflineBlob(payload: OfflineCachePayload): Buffer {
    const key  = this.cacheKey();
    const iv   = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plain  = Buffer.from(JSON.stringify(payload), "utf8");
    const enc    = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag    = cipher.getAuthTag();
    // Format: [4-byte tag length][tag][12-byte iv][ciphertext]
    const tagLen = Buffer.alloc(4);
    tagLen.writeUInt32BE(tag.length, 0);
    return Buffer.concat([tagLen, tag, iv, enc]);
  }

  /**
   * Decrypt and return the offline cache payload from the stored blob.
   * Used server-side to verify the POS offline token.
   */
  decryptOfflineBlob(blob: Buffer): OfflineCachePayload {
    const key    = this.cacheKey();
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as OfflineCachePayload;
  }

  /**
   * Generate an HMAC-signed offline token the POS presents during offline withdrawal.
   * Encodes the customerBvnHash + anchor coords + validity window.
   */
  mintOfflineToken(payload: OfflineCachePayload): string {
    const body = JSON.stringify({
      customerBvnHash: payload.customerBvnHash,
      latitudeDeg:     payload.latitudeDeg,
      longitudeDeg:    payload.longitudeDeg,
      validUntil:      payload.validUntil,
    });
    const sig = createHmac("sha256", this.hmacSecret()).update(body).digest("hex");
    return Buffer.from(JSON.stringify({ body, sig }), "utf8").toString("base64url");
  }

  /**
   * Validate an offline token presented by the POS.
   * Returns the embedded payload if valid; throws if expired or tampered.
   */
  validateOfflineToken(token: string): OfflineCachePayload & { latitudeDeg: number; longitudeDeg: number } {
    let parsed: { body: string; sig: string };
    try {
      parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as { body: string; sig: string };
    } catch {
      throw new BadRequestException("offlineCacheToken is malformed");
    }
    const expectedSig = createHmac("sha256", this.hmacSecret()).update(parsed.body).digest("hex");
    const sigBuf = Buffer.from(parsed.sig, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new BadRequestException("offlineCacheToken signature is invalid");
    }
    const payload = JSON.parse(parsed.body) as {
      customerBvnHash: string; latitudeDeg: number; longitudeDeg: number; validUntil: string;
    };
    if (new Date(payload.validUntil) < new Date()) {
      throw new BadRequestException("offlineCacheToken has expired — request a fresh cache from the server");
    }
    return { ...payload, generatedAt: "" };
  }
}

