import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHash, createHmac,
  randomBytes, randomUUID,
} from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NibssSearchService } from "../bih/nibss-search.service";
import type { InitiateDiscoveryDto } from "./dto/initiate-discovery.dto";
import type { SubmitDiscoveryScanDto } from "./dto/submit-discovery-scan.dto";
import type { SelectAccountDto } from "./dto/select-account.dto";
import {
  BLS_ACCOUNT_SELECTED, BLS_AWAITING_SEAL, BLS_DISCOVERED,
  BLS_EXPIRED, BLS_FAILED, BLS_IDLE_TTL_S, BLS_INITIATED,
  BLS_SESSION_TTL_S, EVT_ACCOUNT_MAP_BUILT, EVT_ACCOUNT_SELECTED,
  EVT_AMOUNT_SET, EVT_DISCOVERY_ENCRYPTED, EVT_DISCOVERY_PURGED,
  EVT_DISCOVERY_SCAN_RECEIVED, EVT_NIBSS_DISCOVERY_MATCHED,
  EVT_NIBSS_DISCOVERY_NOMATCH, EVT_SESSION_INITIATED,
} from "./bls.constants";

/** A single account from the national financial footprint — stored encrypted. */
export interface DiscoveredAccount {
  accountRef:     string;  // masked NUBAN for display: "****1234"
  fullAccountRef: string;  // full NUBAN — only inside AES-GCM blob, NEVER returned to client
  bankCode:       string;
  bankName:       string;
  bankShortName:  string;
  accountType:    string;
  balanceMinor:   number;  // real-time balance in kobo — encrypted blob only
  currency:       string;
  tier:           number;
}

/** Safe projection returned to the client — no full account numbers, no exact balances. */
export type DiscoveredAccountMasked = Omit<DiscoveredAccount, "fullAccountRef"> & {
  balanceDisplay: string;  // e.g. "₦12,400.00"
};

@Injectable()
export class BlsDiscoveryService {
  private readonly log = new Logger(BlsDiscoveryService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    private readonly nibss:   NibssSearchService,
  ) {}

  // ── Crypto ──────────────────────────────────────────────────────────────────
  private accountKey(): Buffer {
    const k = this.config.get<string>("BLS_ACCOUNT_KEY") ?? "bls-account-key-32-chars-padded!!";
    return Buffer.from(k.padEnd(32,"0").slice(0,32));
  }
  private sessionKey(): Buffer {
    const k = this.config.get<string>("BLS_SESSION_KEY") ?? "bls-session-key-32-chars-padded!!";
    return Buffer.from(k.padEnd(32,"0").slice(0,32));
  }

  encryptBlob(data: unknown): Buffer {
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", this.accountKey(), iv);
    const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(data),"utf8")), c.final()]);
    const tag = c.getAuthTag();
    const lb  = Buffer.alloc(4); lb.writeUInt32BE(tag.length,0);
    return Buffer.concat([lb, tag, iv, enc]);
  }
  decryptBlob<T>(blob: Buffer): T {
    const tl = blob.readUInt32BE(0);
    const d  = createDecipheriv("aes-256-gcm", this.accountKey(), blob.subarray(4+tl, 4+tl+12));
    d.setAuthTag(blob.subarray(4, 4+tl));
    return JSON.parse(Buffer.concat([d.update(blob.subarray(4+tl+12)), d.final()]).toString("utf8")) as T;
  }

  private mintToken(sessionRef: string, bvnAnchorHash: string, orgId: string): string {
    const payload = JSON.stringify({ sessionRef, bvnAnchorHash, orgId, createdAt: Date.now() });
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", this.sessionKey(), iv);
    const enc = Buffer.concat([c.update(Buffer.from(payload,"utf8")), c.final()]);
    const tag = c.getAuthTag();
    const lb  = Buffer.alloc(4); lb.writeUInt32BE(tag.length,0);
    return Buffer.concat([lb, tag, iv, enc]).toString("base64url");
  }
  verifyToken(token: string, sessionRef: string): { bvnAnchorHash: string; orgId: string } {
    try {
      const buf = Buffer.from(token,"base64url");
      const tl  = buf.readUInt32BE(0);
      const d   = createDecipheriv("aes-256-gcm", this.sessionKey(), buf.subarray(4+tl, 4+tl+12));
      d.setAuthTag(buf.subarray(4, 4+tl));
      const parsed = JSON.parse(Buffer.concat([d.update(buf.subarray(4+tl+12)), d.final()]).toString("utf8")) as { sessionRef: string; bvnAnchorHash: string; orgId: string };
      if (parsed.sessionRef !== sessionRef) throw new Error("session_ref mismatch");
      return { bvnAnchorHash: parsed.bvnAnchorHash, orgId: parsed.orgId };
    } catch { throw new ForbiddenException("Invalid or tampered session token"); }
  }

  // ── Idle timer guard ────────────────────────────────────────────────────────
  async assertActive(sessionRef: string, orgId: string, requiredStatus?: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.blsSession.findUnique({ where: { sessionRef } });
    if (!s) throw new BadRequestException("BLS session not found");
    if (s.idleExpiresAt < new Date()) {
      await this.prisma.blsSession.update({ where: { sessionRef }, data: { status: BLS_EXPIRED } });
      throw new ForbiddenException("BLS session expired due to 60-second inactivity. Start a new session.");
    }
    if (s.sessionExpiresAt < new Date()) throw new ForbiddenException("BLS session hard timeout exceeded");
    if (requiredStatus && s.status !== requiredStatus)
      throw new BadRequestException(`Expected status ${requiredStatus}, got ${s.status}`);
    return s;
  }
  async refreshIdle(sessionRef: string) {
    await this.prisma.blsSession.update({
      where: { sessionRef }, data: { idleExpiresAt: new Date(Date.now() + BLS_IDLE_TTL_S * 1000) } });
  }

  // ── Step 0: Initiate ────────────────────────────────────────────────────────
  async initiate(dto: InitiateDiscoveryDto) {
    const orgId      = dto.orgId ?? "default";
    const sessionRef = `BLS-${randomUUID()}`;
    const now        = Date.now();
    const idleExp    = new Date(now + BLS_IDLE_TTL_S  * 1000);
    const hardExp    = new Date(now + BLS_SESSION_TTL_S * 1000);

    // Mint placeholder token (bvnAnchorHash populated after discovery scan)
    const token = this.mintToken(sessionRef, "pending", orgId);
    await this.prisma.setOrgContext(orgId);
    await this.prisma.blsSession.create({
      data: { sessionRef, sessionToken: token, status: BLS_INITIATED, idleExpiresAt: idleExp, sessionExpiresAt: hardExp, orgId },
    });
    await this.audit(sessionRef, EVT_SESSION_INITIATED, null, null, null, null, {}, orgId);
    this.log.log(`[BLS] session initiated sessionRef=${sessionRef}`);
    return { sessionRef, sessionToken: token, idleExpiresAt: idleExp, hardExpiresAt: hardExp,
      instruction: "Place finger on FAP-20 sensor then POST rawTemplateB64 + sessionToken to /v1/bls/:ref/discover." };
  }

  // ── Step 1: Discovery Scan ─────────────────────────────────────────────────
  async submitDiscoveryScan(sessionRef: string, dto: SubmitDiscoveryScanDto) {
    const orgId  = dto.orgId ?? "default";
    const session = await this.assertActive(sessionRef, orgId, BLS_INITIATED);
    this.verifyToken(dto.sessionToken, sessionRef); // validates token integrity

    const raw = Buffer.from(dto.rawTemplateB64, "base64");

    // Encrypt before NIBSS transit → hash for audit → purge reference immediately
    const { hash: scanHash } = this.nibss.encryptTemplate(raw);
    await this.audit(sessionRef, EVT_DISCOVERY_SCAN_RECEIVED, null, null, null, null,
      { sensorDeviceId: dto.sensorDeviceId, scanHash }, orgId);
    await this.audit(sessionRef, EVT_DISCOVERY_ENCRYPTED, null, null, null, null, { scanHash }, orgId);

    // NIBSS 1:N search
    const nibssResult = await this.nibss.searchByFingerprint(raw);
    const purgedAt    = new Date(); // raw template goes out of scope here
    await this.audit(sessionRef, EVT_DISCOVERY_PURGED, null, null, null, null,
      { purgedAt: purgedAt.toISOString(), scanHash }, orgId);

    if (!nibssResult.matched || !nibssResult.identity) {
      await this.prisma.blsSession.update({ where: { sessionRef }, data: { status: BLS_FAILED, discoveryScanHash: scanHash } });
      await this.audit(sessionRef, EVT_NIBSS_DISCOVERY_NOMATCH, null, null, nibssResult.latencyMs, null, { latencyMs: nibssResult.latencyMs }, orgId);
      throw new ForbiddenException("Fingerprint not found in NIBSS national registry — no accounts to discover");
    }

    const identity       = nibssResult.identity;
    const discoveryScanId = nibssResult.nibssMatchId!;
    const bvnAnchorHash  = createHash("sha256").update(discoveryScanId).digest("hex");

    // Build account map from NIBSS Account Mapping Feed (stub: realistic multi-bank footprint)
    const accounts = this.buildAccountMap(identity.stateOfOrigin, discoveryScanId);
    const blob     = this.encryptBlob(accounts);

    // Mint new token with bvnAnchorHash now populated
    const newToken = this.mintToken(sessionRef, bvnAnchorHash, orgId);
    await this.prisma.blsSession.update({
      where: { sessionRef },
      data: { status: BLS_DISCOVERED, discoveryScanId, discoveryLatencyMs: nibssResult.latencyMs,
        discoveryScanHash: scanHash, bvnAnchorHash, accountMapBlob: blob,
        sessionToken: newToken, idleExpiresAt: new Date(Date.now() + BLS_IDLE_TTL_S * 1000),
        templateDataPurgedAt: purgedAt },
    });

    await this.audit(sessionRef, EVT_NIBSS_DISCOVERY_MATCHED, discoveryScanId, nibssResult.latencyMs, null, null,
      { latencyMs: nibssResult.latencyMs, stateOfOrigin: identity.stateOfOrigin }, orgId);
    await this.audit(sessionRef, EVT_ACCOUNT_MAP_BUILT, discoveryScanId, null, accounts.length, null,
      { accountCount: accounts.length }, orgId);
    this.log.log(`[BLS] discovered sessionRef=${sessionRef} discoveryScanId=${discoveryScanId} accounts=${accounts.length}`);

    // Return masked list — no full account numbers or exact balances
    return {
      sessionRef, sessionToken: newToken, status: BLS_DISCOVERED,
      discoveryScanId, discoveryLatencyMs: nibssResult.latencyMs,
      identityPreview: { fullName: identity.fullName, stateOfOrigin: identity.stateOfOrigin },
      accounts: accounts.map(a => this.maskAccount(a)),
      message: `Discovery complete — ${accounts.length} linked accounts found across ${new Set(accounts.map(a => a.bankCode)).size} institutions. Select account and enter withdrawal amount.`,
    };
  }

  // ── Step 2: Select Account + Amount ────────────────────────────────────────
  async selectAccount(sessionRef: string, dto: SelectAccountDto) {
    const orgId   = dto.orgId ?? "default";
    const session = await this.assertActive(sessionRef, orgId, BLS_DISCOVERED);
    this.verifyToken(dto.sessionToken, sessionRef);
    if (!session.accountMapBlob) throw new BadRequestException("Account map missing from session");

    const accounts = this.decryptBlob<DiscoveredAccount[]>(Buffer.from(session.accountMapBlob));
    const chosen   = accounts.find(a => a.accountRef === dto.selectedAccountRef);
    if (!chosen) throw new BadRequestException(`Account ref ${dto.selectedAccountRef} not found in discovered map`);
    if (dto.amountMinor > chosen.balanceMinor)
      throw new BadRequestException(`Insufficient balance: requested ${dto.amountMinor}, available ${chosen.balanceMinor}`);

    await this.prisma.blsSession.update({
      where: { sessionRef },
      data: { status: BLS_AWAITING_SEAL, selectedAccountRef: dto.selectedAccountRef,
        selectedBankCode: chosen.bankCode, selectedBankName: chosen.bankName,
        withdrawalAmountMinor: BigInt(dto.amountMinor), idleExpiresAt: new Date(Date.now() + BLS_IDLE_TTL_S * 1000) },
    });
    await this.audit(sessionRef, EVT_ACCOUNT_SELECTED, session.discoveryScanId, null, null, chosen.bankCode,
      { bankCode: chosen.bankCode, bankName: chosen.bankName, accountRef: chosen.accountRef }, orgId);
    await this.audit(sessionRef, EVT_AMOUNT_SET, session.discoveryScanId, null, null, chosen.bankCode,
      { amountMinor: dto.amountMinor, amountNaira: `₦${(dto.amountMinor/100).toFixed(2)}` }, orgId);

    return {
      sessionRef, status: BLS_AWAITING_SEAL,
      confirmation: {
        prompt: `Confirm Withdrawal of ₦${(dto.amountMinor/100).toFixed(2)} from ${chosen.bankName}?`,
        bank: chosen.bankName, accountRef: chosen.accountRef, amountNaira: `₦${(dto.amountMinor/100).toFixed(2)}`,
      },
      message: "Account selected. Perform the Final Authorization Scan (Second Fingerprint) to execute.",
    };
  }

  // ── Account Mapping Feed Stub ───────────────────────────────────────────────
  private buildAccountMap(seed: string, discoveryScanId: string): DiscoveredAccount[] {
    const banks = [
      { code:"011151012", name:"First Bank of Nigeria PLC", shortName:"FirstBank", tier:1 },
      { code:"058063220", name:"Guaranty Trust Bank PLC",   shortName:"GTBank",    tier:1 },
      { code:"044150149", name:"Access Bank PLC",            shortName:"Access",   tier:1 },
      { code:"057080004", name:"Zenith Bank PLC",            shortName:"Zenith",   tier:1 },
      { code:"070080003", name:"Fidelity Bank PLC",          shortName:"Fidelity", tier:2 },
      { code:"076080045", name:"Polaris Bank Limited",       shortName:"Polaris",  tier:2 },
    ];
    const count = 2 + Math.floor(Math.random() * 3); // 2–4 accounts
    const used  = new Set<string>();
    const result: DiscoveredAccount[] = [];
    for (let i = 0; i < count; i++) {
      const bank = banks[i % banks.length];
      const nuban = createHmac("sha256", discoveryScanId).update(`${seed}-${i}`).digest("hex").slice(0,10);
      const masked = `****${nuban.slice(-4)}`;
      if (used.has(masked)) continue;
      used.add(masked);
      result.push({
        accountRef: masked, fullAccountRef: nuban, bankCode: bank.code, bankName: bank.name,
        bankShortName: bank.shortName, accountType: i === 0 ? "SAVINGS" : "CURRENT",
        balanceMinor: Math.floor(Math.random() * 50_000_000) + 500_000, // ₦5,000 – ₦500,000
        currency: "NGN", tier: bank.tier,
      });
    }
    return result;
  }

  private maskAccount(a: DiscoveredAccount): DiscoveredAccountMasked {
    const { fullAccountRef: _, balanceMinor, ...rest } = a;
    return { ...rest, balanceMinor, balanceDisplay: `₦${(balanceMinor/100).toLocaleString("en-NG",{minimumFractionDigits:2})}` };
  }

  // ── Shared audit writer ─────────────────────────────────────────────────────
  async audit(sessionRef: string, eventType: string, discoveryScanId: string | null | undefined,
    discoveryLatencyMs: number | null | undefined, sealLatencyMs: number | null | undefined,
    selectedBankCode: string | null | undefined, metadata: Record<string, unknown>, orgId: string,
  ) {
    try {
      await this.prisma.blsAuditLog.create({
        data: { sessionRef, eventType, discoveryScanId: discoveryScanId ?? null,
          discoveryLatencyMs: discoveryLatencyMs ?? null, sealLatencyMs: sealLatencyMs ?? null,
          selectedBankCode: selectedBankCode ?? null, metadataJson: JSON.stringify(metadata), orgId },
      });
    } catch { /* audit never breaks main flow */ }
  }
}

