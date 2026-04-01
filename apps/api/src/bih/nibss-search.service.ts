import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHash, createHmac,
  randomBytes, randomUUID,
} from "node:crypto";
import { BIH_NIBSS_TARGET_MS } from "./bih.constants";

/** Full NIBSS identity package — AES-256-GCM encrypted at rest. */
export interface NibssIdentityPackage {
  nibssMatchId:  string;
  fullName:      string;
  firstName:     string;
  lastName:      string;
  middleName:    string;
  dateOfBirth:   string;  // YYYY-MM-DD
  gender:        string;  // "M" | "F"
  address:       string;
  stateOfOrigin: string;
  lga:           string;
  photoHash:     string;  // SHA-256 of NIBSS passport photo — not the photo itself
  signatureHash: string;
  bvnResolved:   string;  // last 3 digits masked: "***123456***"
  matchedAt:     string;
}

export interface NibssSearchResult {
  matched:      boolean;
  nibssMatchId: string | null;
  latencyMs:    number;
  identity:     NibssIdentityPackage | null;
}

/**
 * NibssSearchService — 1:N Biometric Search of the National BVN Registry.
 *
 * Security protocol:
 *   1. Raw template arrives at server over TLS 1.3.
 *   2. Server encrypts with AES-256-GCM (BIH_TEMPLATE_KEY) — this is the "encrypted minutiae".
 *   3. Encrypted minutiae forwarded to NIBSS Biometric Gateway (mTLS in production).
 *   4. NIBSS performs 1:N search across entire national BVN registry.
 *   5. On match: NIBSS decrypts on their side, returns matchId + identity package.
 *   6. Server purges encrypted template immediately — only SHA-256 hash retained for audit.
 *
 * Latency target: sub-3-second NIBSS round-trip (BIH_NIBSS_TARGET_MS = 3 000ms).
 * In production: NIBSS connection uses TCP keep-alive + HTTP/2 multiplexing.
 */
@Injectable()
export class NibssSearchService {
  private readonly log = new Logger(NibssSearchService.name);

  constructor(private readonly config: ConfigService) {}

  private templateKey(): Buffer {
    const k = this.config.get<string>("BIH_TEMPLATE_KEY") ?? "bih-template-key-32-chars-minimum";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  private shadowKey(): Buffer {
    const k = this.config.get<string>("BIH_SHADOW_KEY") ?? "bih-shadow-key-32-chars-minimum!!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  /** AES-256-GCM encrypt fingerprint minutiae for NIBSS transit. */
  encryptTemplate(rawTemplate: Buffer): { encrypted: Buffer; hash: string } {
    const iv    = randomBytes(12);
    const c     = createCipheriv("aes-256-gcm", this.templateKey(), iv);
    const enc   = Buffer.concat([c.update(rawTemplate), c.final()]);
    const tag   = c.getAuthTag();
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(tag.length, 0);
    const encrypted = Buffer.concat([lenBuf, tag, iv, enc]);
    const hash  = createHash("sha256").update(encrypted).digest("hex");
    return { encrypted, hash };
  }

  /** AES-256-GCM encrypt NIBSS identity package for storage. */
  encryptIdentity(pkg: NibssIdentityPackage): Buffer {
    const plain = Buffer.from(JSON.stringify(pkg), "utf8");
    const iv    = randomBytes(12);
    const c     = createCipheriv("aes-256-gcm", this.shadowKey(), iv);
    const enc   = Buffer.concat([c.update(plain), c.final()]);
    const tag   = c.getAuthTag();
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lenBuf, tag, iv, enc]);
  }

  /** AES-256-GCM decrypt NIBSS identity package from storage. */
  decryptIdentity(blob: Buffer): NibssIdentityPackage {
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const d      = createDecipheriv("aes-256-gcm", this.shadowKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8")) as NibssIdentityPackage;
  }

  /**
   * 1:N National Registry Search — core BIH handshake.
   *
   * Production: POST encrypted template to NIBSS Biometric Gateway via mTLS.
   * Stub: Generates synthetic identity + nibssMatchId, measures realistic latency.
   * Simulates ~95% match rate (5% no-match for testing the rejection path).
   */
  async searchByFingerprint(rawTemplate: Buffer): Promise<NibssSearchResult> {
    const t0 = Date.now();

    // Encrypt before NIBSS transit
    const { encrypted: _enc, hash: _hash } = this.encryptTemplate(rawTemplate);
    // _enc would be forwarded to NIBSS in production; purged after response
    // _hash retained in session for audit trail

    // Stub network latency: 200–1 200ms to simulate sub-3s round-trip
    await new Promise(r => setTimeout(r, 200 + Math.random() * 1000));

    const latencyMs = Date.now() - t0;
    if (latencyMs > BIH_NIBSS_TARGET_MS) {
      this.log.warn(`[BIH][NIBSS] latency EXCEEDED target: ${latencyMs}ms > ${BIH_NIBSS_TARGET_MS}ms`);
    }

    // Simulate 95% match rate
    if (Math.random() < 0.05) {
      return { matched: false, nibssMatchId: null, latencyMs, identity: null };
    }

    const firstNames  = ["Adaora","Emeka","Fatima","Chidi","Ngozi","Babatunde","Aisha","Oluwaseun","Uchenna","Blessing"];
    const lastNames   = ["Okafor","Nwosu","Musa","Adeleke","Eze","Balogun","Ibrahim","Oluwafemi","Obiora","Akintola"];
    const states      = ["Lagos","Kano","Abuja","Rivers","Anambra","Oyo","Kaduna","Delta","Enugu","Imo"];
    const lgas        = ["Ikeja","Nassarawa","Gwale","Port Harcourt","Awka","Ibadan","Zaria","Warri","Enugu-North","Owerri"];
    const pick        = (a: string[]) => a[Math.floor(Math.random() * a.length)];

    const fn = pick(firstNames); const ln = pick(lastNames); const mn = pick(firstNames);
    const dob = new Date(1970 + Math.floor(Math.random() * 35), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));
    const nibssMatchId = `NIBSS-BIO-${randomUUID().toUpperCase()}`;

    const bvnPartial = String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);

    const identity: NibssIdentityPackage = {
      nibssMatchId, fullName: `${ln} ${fn} ${mn}`, firstName: fn, lastName: ln, middleName: mn,
      dateOfBirth: dob.toISOString().split("T")[0], gender: Math.random() > 0.5 ? "M" : "F",
      address: `${Math.floor(Math.random() * 200) + 1} ${ln} Avenue, ${pick(states)}`,
      stateOfOrigin: pick(states), lga: pick(lgas),
      photoHash:     createHmac("sha256","photo-key").update(nibssMatchId).digest("hex"),
      signatureHash: createHmac("sha256","sig-key").update(nibssMatchId).digest("hex"),
      bvnResolved:   `***${bvnPartial.slice(3,7)}***`, matchedAt: new Date().toISOString(),
    };

    this.log.log(`[BIH][NIBSS] 1:N match nibssMatchId=${nibssMatchId} latencyMs=${latencyMs}`);
    return { matched: true, nibssMatchId, latencyMs, identity };
  }
}

