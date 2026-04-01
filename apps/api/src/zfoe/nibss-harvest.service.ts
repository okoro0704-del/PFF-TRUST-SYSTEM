import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID,
} from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { InitiateHarvestDto } from "./dto/initiate-harvest.dto";
import type { SelectBankDto } from "./dto/select-bank.dto";
import {
  EVT_BANK_SELECTED, EVT_HARVEST_INITIATED, EVT_IDENTITY_FETCHED,
  ZFOE_BANK_SELECTED, ZFOE_FAILED, ZFOE_IDENTITY_FETCHED, ZFOE_SESSION_TTL_S,
} from "./zfoe.constants";
import { BankDirectoryService } from "./bank-directory.service";

export interface ShadowProfilePreview {
  fullName: string; dateOfBirth: string; gender: string;
  stateOfOrigin: string; verifiedAddress: string; phoneLastThree: string;
}
interface ShadowProfileFull extends ShadowProfilePreview {
  msisdnHash: string; nibssTokenId: string;
  signatureHash: string; photoHash: string; harvestedAt: string;
}

/**
 * NibssHarvestService — One-Touch Identity Harvest.
 *
 * Step 1 of ZFOE: The user's BVN-linked MSISDN is resolved against the NIBSS
 * National Identity Mirror. The full identity package (name, DOB, address, gender,
 * photo hash, signature hash) is assembled and AES-256-GCM encrypted before storage.
 * Only a partial preview (no BVN, no raw biometrics) is returned to the client.
 */
@Injectable()
export class NibssHarvestService {
  private readonly log = new Logger(NibssHarvestService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly config:   ConfigService,
    private readonly bankDir:  BankDirectoryService,
  ) {}

  private aesKey(): Buffer {
    const k = this.config.get<string>("ZFOE_SHADOW_KEY") ?? "zfoe-shadow-key-32chars-minimum!";
    return Buffer.from(k.padEnd(32, "0").slice(0, 32));
  }

  private msisdnHash(msisdn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(msisdn).digest("hex");
  }

  private encrypt(plain: Buffer): Buffer {
    const iv  = randomBytes(12);
    const c   = createCipheriv("aes-256-gcm", this.aesKey(), iv);
    const enc = Buffer.concat([c.update(plain), c.final()]);
    const tag = c.getAuthTag();
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(tag.length, 0);
    return Buffer.concat([lenBuf, tag, iv, enc]);
  }

  /** Step 1 — MSISDN → NIBSS National Identity Mirror → encrypted Shadow Profile */
  async initiateHarvest(dto: InitiateHarvestDto) {
    const orgId = dto.orgId ?? "default";
    const mHash = this.msisdnHash(dto.msisdn);
    await this.prisma.setOrgContext(orgId);

    // Dedup: block concurrent active sessions for the same MSISDN
    const active = await this.prisma.zfoeSession.findFirst({
      where: { msisdnHash: mHash, status: { notIn: [ZFOE_FAILED, "COMPLETED"] }, orgId },
    });
    if (active && active.sessionExpiresAt > new Date()) {
      throw new ConflictException(`Active ZFOE session already in progress (ref: ${active.sessionRef})`);
    }

    const sessionRef   = `ZFOE-${randomUUID()}`;
    const expiresAt    = new Date(Date.now() + ZFOE_SESSION_TTL_S * 1000);
    const nibssTokenId = `NIBSS-${randomUUID().toUpperCase()}`;

    // Stub identity data (production: POST msisdn to NIBSS BVNAP identity mirror)
    const firstNames = ["Adaora","Emeka","Fatima","Chidi","Ngozi","Babatunde","Aisha","Oluwaseun"];
    const lastNames  = ["Okafor","Nwosu","Musa","Adeleke","Eze","Balogun","Ibrahim","Oluwafemi"];
    const states     = ["Lagos","Kano","Abuja","Rivers","Anambra","Oyo","Kaduna","Delta"];
    const pick       = (a: string[]) => a[Math.floor(Math.random() * a.length)];
    const fn = pick(firstNames); const ln = pick(lastNames); const mn = pick(firstNames);
    const dob = new Date(1975 + Math.floor(Math.random() * 30), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28));

    const profile: ShadowProfileFull = {
      fullName:        `${ln} ${fn} ${mn}`,
      dateOfBirth:     dob.toISOString().split("T")[0],
      gender:          Math.random() > 0.5 ? "M" : "F",
      stateOfOrigin:   pick(states),
      verifiedAddress: `${Math.floor(Math.random() * 200) + 1} ${ln} Street, Victoria Island`,
      phoneLastThree:  "***" + dto.msisdn.slice(-3),
      msisdnHash:      mHash,
      nibssTokenId,
      signatureHash:   createHmac("sha256", "sig").update(dto.msisdn).digest("hex"),
      photoHash:       createHmac("sha256", "photo").update(dto.msisdn + "photo").digest("hex"),
      harvestedAt:     new Date().toISOString(),
    };

    const blob = this.encrypt(Buffer.from(JSON.stringify(profile), "utf8"));
    await this.prisma.zfoeSession.create({
      data: { sessionRef, msisdnHash: mHash, nibssTokenId, shadowProfileBlob: blob, status: ZFOE_IDENTITY_FETCHED, sessionExpiresAt: expiresAt, orgId },
    });

    await this.writeAudit(sessionRef, EVT_HARVEST_INITIATED, nibssTokenId, null, orgId, { phoneLastThree: profile.phoneLastThree });
    await this.writeAudit(sessionRef, EVT_IDENTITY_FETCHED, nibssTokenId, null, orgId, { stateOfOrigin: profile.stateOfOrigin, gender: profile.gender });
    this.log.log(`[ZFOE][harvest] sessionRef=${sessionRef} nibssToken=${nibssTokenId}`);

    const preview: ShadowProfilePreview = {
      fullName: profile.fullName, dateOfBirth: profile.dateOfBirth,
      gender: profile.gender, stateOfOrigin: profile.stateOfOrigin,
      verifiedAddress: profile.verifiedAddress, phoneLastThree: profile.phoneLastThree,
    };
    return { sessionRef, preview, expiresAt, bankDirectory: this.bankDir.listBanks(),
      message: "Identity harvested from NIBSS mirror. Select a bank to proceed." };
  }

  /** Step 2 — Customer selects bank + account type */
  async selectBank(sessionRef: string, dto: SelectBankDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);
    const session = await this.loadActive(sessionRef, orgId, ZFOE_IDENTITY_FETCHED);
    const bank    = this.bankDir.findByCode(dto.bankCode);

    await this.prisma.zfoeSession.update({
      where: { sessionRef },
      data: { selectedBankCode: dto.bankCode, selectedBankName: bank.name, accountType: dto.accountType, status: ZFOE_BANK_SELECTED },
    });
    await this.writeAudit(sessionRef, EVT_BANK_SELECTED, session.nibssTokenId, null, orgId,
      { bankCode: dto.bankCode, bankName: bank.name, accountType: dto.accountType });

    return { sessionRef, status: ZFOE_BANK_SELECTED, selectedBank: { code: bank.code, name: bank.name, swift: bank.swift, tier: bank.tier },
      accountType: dto.accountType, message: "Bank selected. Proceed to biometric authorization." };
  }

  async getSessionPreview(sessionRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.zfoeSession.findUnique({ where: { sessionRef } });
    if (!s || !s.shadowProfileBlob) throw new BadRequestException("Session not found or identity not yet fetched");
    const profile = this.decryptProfile(Buffer.from(s.shadowProfileBlob));
    const { signatureHash: _s, photoHash: _p, msisdnHash: _m, nibssTokenId: _n, harvestedAt: _h, ...preview } = profile;
    return { sessionRef, status: s.status, preview, selectedBankCode: s.selectedBankCode, accountType: s.accountType };
  }

  /** Expose decrypted profile to AccountProvisionService */
  decryptProfile(blob: Buffer): ShadowProfileFull {
    const tagLen = blob.readUInt32BE(0);
    const tag    = blob.subarray(4, 4 + tagLen);
    const iv     = blob.subarray(4 + tagLen, 4 + tagLen + 12);
    const enc    = blob.subarray(4 + tagLen + 12);
    const d      = createDecipheriv("aes-256-gcm", this.aesKey(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8")) as ShadowProfileFull;
  }

  async loadActive(sessionRef: string, orgId: string, requiredStatus?: string) {
    const s = await this.prisma.zfoeSession.findUnique({ where: { sessionRef } });
    if (!s) throw new BadRequestException("ZFOE session not found");
    if (s.sessionExpiresAt < new Date()) throw new BadRequestException("ZFOE session has expired");
    if (requiredStatus && s.status !== requiredStatus)
      throw new BadRequestException(`Expected status ${requiredStatus}, got ${s.status}`);
    return s;
  }

  async writeAudit(sessionRef: string, eventType: string, nibssTokenId: string | null | undefined, bankApiResponse: string | null, orgId: string, metadata?: Record<string, unknown>) {
    try {
      await this.prisma.zfoeAuditLog.create({
        data: { sessionRef, eventType, nibssTokenId: nibssTokenId ?? null,
          bankApiResponse, metadataJson: metadata ? JSON.stringify(metadata) : null, orgId },
      });
    } catch { /* audit must never break the main flow */ }
  }
}

