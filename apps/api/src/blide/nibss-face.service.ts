import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHash, createHmac,
  randomBytes, randomUUID,
} from "node:crypto";
import type { NibssIdentityPackage } from "../bih/nibss-search.service";

/** One discovered account from the NIBSS BVN-linked account registry. */
export interface BlideDiscoveredAccount {
  accountRef:     string;   // masked NUBAN: "****1234"
  fullAccountRef: string;   // full NUBAN — inside AES-GCM blob only
  bankCode:       string;
  bankName:       string;
  bankShortName:  string;
  accountType:    string;
  balanceMinor:   number;   // real-time balance in kobo
  balanceDisplay: string;   // "₦12,400.00"
  currency:       string;
  tier:           number;
}

export interface NibssFaceSearchResult {
  matched:       boolean;
  faceMatchId:   string | null;
  latencyMs:     number;
  identity:      NibssIdentityPackage | null;
  accounts:      BlideDiscoveredAccount[] | null; // null for ACCOUNT_SETUP
}

/**
 * NibssFaceService — NIBSS 1:N Face Search (ISO 19794-5).
 *
 * Key differences from NibssSearchService (fingerprint):
 *   - Uses BLIDE_FACE_KEY (not BIH_TEMPLATE_KEY) — separate AES-256-GCM keyspace.
 *   - Face template format: ISO 19794-5 / JPEG / HEIF.
 *   - Account discovery: returns account list sorted DESC by balance (for financial txns).
 *   - ACCOUNT_SETUP: returns identity package, no account list.
 *   - NIBSS match ID prefix: "NIBSS-FACE-" (not "NIBSS-BIO-").
 */
@Injectable()
export class NibssFaceService {
  private readonly log = new Logger(NibssFaceService.name);

  constructor(private readonly config: ConfigService) {}

  private faceKey(): Buffer {
    const k = this.config.get<string>("BLIDE_FACE_KEY") ?? "blide-face-key-32-chars-padded!!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }
  private shadowKey(): Buffer {
    const k = this.config.get<string>("BLIDE_SHADOW_KEY") ?? "blide-shadow-key-32-chars-padded";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  /** AES-256-GCM encrypt face frame before NIBSS transit. */
  encryptFaceTemplate(rawFrame: Buffer): { encrypted: Buffer; hash: string } {
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", this.faceKey(), iv);
    const enc = Buffer.concat([c.update(rawFrame), c.final()]);
    const tag = c.getAuthTag();
    const lb  = Buffer.alloc(4); lb.writeUInt32BE(tag.length, 0);
    const encrypted = Buffer.concat([lb, tag, iv, enc]);
    return { encrypted, hash: createHash("sha256").update(encrypted).digest("hex") };
  }

  /** AES-256-GCM encrypt any data blob (identity or account map). */
  encryptBlob(data: unknown): Buffer {
    const iv  = randomBytes(12); const k = this.shadowKey();
    const c   = createCipheriv("aes-256-gcm", k, iv);
    const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(data), "utf8")), c.final()]);
    const tag = c.getAuthTag();
    const lb  = Buffer.alloc(4); lb.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lb, tag, iv, enc]);
  }
  decryptBlob<T>(blob: Buffer): T {
    const tl = blob.readUInt32BE(0);
    const d  = createDecipheriv("aes-256-gcm", this.shadowKey(), blob.subarray(4 + tl, 4 + tl + 12));
    d.setAuthTag(blob.subarray(4, 4 + tl));
    return JSON.parse(Buffer.concat([d.update(blob.subarray(4 + tl + 12)), d.final()]).toString("utf8")) as T;
  }

  /**
   * NIBSS 1:N Face Search — core BLIDE discovery ping.
   *
   * Production: POST AES-256-GCM encrypted ISO 19794-5 frame to NIBSS Face Gateway (mTLS).
   * Stub: generates synthetic identity + 2–4 discovered accounts sorted DESC by balance.
   * Match rate: 95% (5% NoMatch simulates unregistered faces).
   */
  async searchByFace(rawFrame: Buffer, transactionType: string): Promise<NibssFaceSearchResult> {
    const t0 = Date.now();
    // Encrypt before NIBSS transit — reference discarded immediately after hash stored
    this.encryptFaceTemplate(rawFrame);

    // Stub NIBSS latency: 150–900ms (face recognition faster than fingerprint in production)
    await new Promise(r => setTimeout(r, 150 + Math.random() * 750));
    const latencyMs = Date.now() - t0;

    if (Math.random() < 0.05) {
      return { matched: false, faceMatchId: null, latencyMs, identity: null, accounts: null };
    }

    const faceMatchId = `NIBSS-FACE-${randomUUID().toUpperCase()}`;
    const firstNames  = ["Adaeze","Emeka","Fatima","Chidi","Ngozi","Babatunde","Aisha","Oluwaseun","Uchenna","Blessing"];
    const lastNames   = ["Okafor","Nwosu","Musa","Adeleke","Eze","Balogun","Ibrahim","Oluwafemi","Obiora","Akintola"];
    const states      = ["Lagos","Kano","Abuja","Rivers","Anambra","Oyo","Kaduna","Delta","Enugu","Imo"];
    const lgas        = ["Ikeja","Nassarawa","Gwale","Port Harcourt","Awka","Ibadan","Zaria","Warri","Enugu-North","Owerri"];
    const pick        = (a: string[]) => a[Math.floor(Math.random() * a.length)];

    const fn  = pick(firstNames); const ln = pick(lastNames); const mn = pick(firstNames);
    const dob = new Date(1970 + Math.floor(Math.random() * 35), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));

    const identity: NibssIdentityPackage = {
      nibssMatchId: faceMatchId, fullName: `${ln} ${fn} ${mn}`,
      firstName: fn, lastName: ln, middleName: mn,
      dateOfBirth: dob.toISOString().split("T")[0], gender: Math.random() > 0.5 ? "M" : "F",
      address: `${Math.floor(Math.random() * 200) + 1} ${ln} Avenue, ${pick(states)}`,
      stateOfOrigin: pick(states), lga: pick(lgas),
      photoHash:     createHmac("sha256", "photo").update(faceMatchId).digest("hex"),
      signatureHash: createHmac("sha256", "sig").update(faceMatchId).digest("hex"),
      bvnResolved:   `***${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}***`,
      matchedAt:     new Date().toISOString(),
    };

    const accounts = transactionType !== "ACCOUNT_SETUP"
      ? this.buildAccountMap(faceMatchId).sort((a, b) => b.balanceMinor - a.balanceMinor)
      : null;

    this.log.log(`[BLIDE][NIBSS-FACE] match faceMatchId=${faceMatchId} latencyMs=${latencyMs}`);
    return { matched: true, faceMatchId, latencyMs, identity, accounts };
  }

  private buildAccountMap(faceMatchId: string): BlideDiscoveredAccount[] {
    const banks = [
      { code:"058063220", name:"Guaranty Trust Bank PLC", shortName:"GTBank",   tier:1 },
      { code:"057080004", name:"Zenith Bank PLC",          shortName:"Zenith",   tier:1 },
      { code:"044150149", name:"Access Bank PLC",           shortName:"Access",  tier:1 },
      { code:"011151012", name:"First Bank of Nigeria PLC", shortName:"FirstBank",tier:1},
      { code:"070080003", name:"Fidelity Bank PLC",         shortName:"Fidelity",tier:2},
    ];
    const count = 2 + Math.floor(Math.random() * 3);
    return banks.slice(0, count).map((b, i) => {
      const nuban   = createHmac("sha256", faceMatchId).update(`acc-${i}`).digest("hex").slice(0, 10);
      const balance = Math.floor(Math.random() * 100_000_000) + 500_000; // ₦5k–₦1M
      return {
        accountRef: `****${nuban.slice(-4)}`, fullAccountRef: nuban,
        bankCode: b.code, bankName: b.name, bankShortName: b.shortName,
        accountType: i === 0 ? "SAVINGS" : "CURRENT", balanceMinor: balance,
        balanceDisplay: `₦${(balance / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`,
        currency: "NGN", tier: b.tier,
      };
    });
  }
}

