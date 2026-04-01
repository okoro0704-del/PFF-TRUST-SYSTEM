import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { SentinelService } from "../sentinel/sentinel.service";
import { PulseSyncService } from "../execution/pulse-sync.service";
import { TERMINAL_LOCK_HARD, TERMINAL_UNLOCKED } from "./terminal.constants";
import type { BindTerminalDto } from "./dto/bind-terminal.dto";
import type { UnlockTerminalDto } from "./dto/unlock-terminal.dto";

@Injectable()
export class TerminalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nibssFactory: NibssFactory,
    private readonly liveness: StubLivenessService,
    private readonly sentinel: SentinelService,
    private readonly pulseSync: PulseSyncService,
    private readonly config: ConfigService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  private inactivityMs(): number {
    const m = Number(this.config.get("TERMINAL_INACTIVITY_MINUTES") ?? 20);
    return Math.max(1, m) * 60 * 1000;
  }

  private async appendTcpLedger(orgId: string, terminalId: string, eventType: string, payload?: unknown) {
    await this.prisma.setOrgContext(orgId);
    await this.prisma.terminalTcpLedger.create({
      data: {
        orgId,
        terminalId,
        eventType,
        payloadJson: payload === undefined ? null : JSON.stringify(payload),
      },
    });
  }

  /** Map Terminal_ID → verified Agent BVN (must exist in TFAN). */
  async bindTerminal(dto: BindTerminalDto) {
    const orgId = dto.orgId ?? "default";
    const hash = this.bvnHash(dto.agentBvn);
    await this.prisma.setOrgContext(orgId);
    const enrolled = await this.prisma.tfanRecord.findFirst({ where: { bvnHash: hash } });
    if (!enrolled) {
      throw new BadRequestException("Agent BVN is not enrolled; complete triple-gate enrollment first");
    }
    const existing = await this.prisma.posTerminal.findUnique({ where: { terminalId: dto.terminalId } });
    if (existing) {
      throw new ConflictException("Terminal already bound");
    }
    const now = new Date();
    const row = await this.prisma.posTerminal.create({
      data: {
        terminalId: dto.terminalId,
        agentBvnHash: hash,
        lockState: TERMINAL_LOCK_HARD,
        lastActivityAt: now,
        orgId,
      },
    });
    await this.appendTcpLedger(orgId, dto.terminalId, "BIND", { agentBvnHash: hash });
    return {
      terminalId: row.terminalId,
      lockState: row.lockState,
      agentBvnHash: row.agentBvnHash,
    };
  }

  async heartbeat(terminalId: string, orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const t = await this.prisma.posTerminal.findFirst({ where: { terminalId, orgId } });
    if (!t) throw new NotFoundException("Unknown terminal");
    await this.prisma.posTerminal.update({
      where: { id: t.id },
      data: { lastActivityAt: new Date() },
    });
    const batch = await this.pulseSync.settlePendingForOrg(orgId);
    return {
      terminalId,
      lastActivityAt: new Date().toISOString(),
      lockState: t.lockState,
      pulseBatchSettlement: batch,
    };
  }

  /**
   * POS unlock: NIBSS Face | Fingerprint | Mobile (push/OTP channel via ICAD).
   * Match_Found = any gate Yes → release lock. Three consecutive failures → Sentinel stealth + GPS.
   */
  async attemptUnlock(terminalId: string, dto: UnlockTerminalDto) {
    const orgId = dto.orgId ?? "default";
    await this.prisma.setOrgContext(orgId);
    const t = await this.prisma.posTerminal.findFirst({ where: { terminalId, orgId } });
    if (!t) throw new NotFoundException("Unknown terminal");
    const hash = this.bvnHash(dto.agentBvn);
    if (hash !== t.agentBvnHash) {
      throw new BadRequestException("Agent BVN does not match bound terminal");
    }

    if (t.lockState !== TERMINAL_LOCK_HARD) {
      await this.prisma.posTerminal.update({
        where: { id: t.id },
        data: { lastActivityAt: new Date() },
      });
      return {
        released: true,
        lockState: t.lockState,
        matchFound: true,
        alreadyOperational: true,
      };
    }

    const fp = dto.fingerprintTemplateB64?.length
      ? Buffer.from(dto.fingerprintTemplateB64, "base64")
      : undefined;
    const face = dto.faceTemplateB64?.length ? Buffer.from(dto.faceTemplateB64, "base64") : undefined;
    const mobile = dto.mobileNumber?.trim();

    if (!(fp?.length || face?.length || mobile?.length)) {
      throw new BadRequestException("Provide at least one of fingerprint, face, or mobile");
    }

    if (face?.length) {
      const live = await this.liveness.verifyPassive(face);
      if (!live.pass) throw new BadRequestException("Passive liveness failed");
    }

    const nibss = await this.runPosUnlockGates(dto.agentBvn, fp, face, mobile);
    const matchFound = nibss.matchFound;

    if (matchFound) {
      await this.prisma.posTerminal.update({
        where: { id: t.id },
        data: {
          lockState: TERMINAL_UNLOCKED,
          lastActivityAt: new Date(),
          consecutiveFailedUnlocks: 0,
          stealthCaptureAt: null,
        },
      });
      await this.appendTcpLedger(orgId, terminalId, "UNLOCK_OK", {
        gates: nibss.outcomes,
      });
      return {
        released: true,
        lockState: TERMINAL_UNLOCKED,
        matchFound: true,
        gates: nibss.outcomes,
      };
    }

    const fails = t.consecutiveFailedUnlocks + 1;
    await this.prisma.posTerminal.update({
      where: { id: t.id },
      data: { consecutiveFailedUnlocks: fails },
    });
    await this.appendTcpLedger(orgId, terminalId, "UNLOCK_FAIL", {
      gates: nibss.outcomes,
      consecutiveFailedUnlocks: fails,
    });

    if (fails >= 3) {
      await this.sentinel.reportStealthCaptureAndGpsAlert({
        terminalId,
        agentBvnHash: t.agentBvnHash,
        consecutiveFailures: fails,
        latitude: dto.latitude,
        longitude: dto.longitude,
        gatesTried: {
          fingerprint: !!fp?.length,
          face: !!face?.length,
          mobile: !!mobile?.length,
        },
        outcomes: nibss.outcomes,
      });
      await this.prisma.posTerminal.update({
        where: { id: t.id },
        data: {
          consecutiveFailedUnlocks: 0,
          stealthCaptureAt: new Date(),
          lockState: TERMINAL_LOCK_HARD,
        },
      });
      await this.appendTcpLedger(orgId, terminalId, "SENTINEL_STEALTH_GPS", {
        latitude: dto.latitude,
        longitude: dto.longitude,
      });
    }

    return {
      released: false,
      lockState: TERMINAL_LOCK_HARD,
      matchFound: false,
      gates: nibss.outcomes,
      consecutiveFailedUnlocks: fails,
      sentinelTriggered: fails >= 3,
    };
  }

  private async runPosUnlockGates(
    bvn: string,
    fp?: Buffer,
    face?: Buffer,
    mobile?: string,
  ): Promise<{
    matchFound: boolean;
    outcomes: { fingerprint?: string; face?: string; mobile?: string };
  }> {
    const bundle = this.nibssFactory.create();
    type Gate = "fingerprint" | "face" | "mobile";
    const tasks: Promise<{ gate: Gate; outcome: MatchOutcome }>[] = [];

    if (fp?.length) {
      tasks.push(
        bundle.biometric.verifyFingerprint(bvn, fp).then((r) => ({ gate: "fingerprint", outcome: r.outcome })),
      );
    }
    if (face?.length) {
      tasks.push(
        bundle.biometric.verifyFace(bvn, face).then((r) => ({ gate: "face", outcome: r.outcome })),
      );
    }
    if (mobile?.length) {
      tasks.push(
        bundle.mobile.verifyMobile(bvn, mobile).then((r) => ({ gate: "mobile", outcome: r.outcome })),
      );
    }

    const settled = await Promise.all(tasks);
    const outcomes: { fingerprint?: string; face?: string; mobile?: string } = {};
    for (const s of settled) {
      outcomes[s.gate] = s.outcome;
    }
    const matchFound = settled.some((s) => s.outcome === MatchOutcome.MatchFound);
    return { matchFound, outcomes };
  }

  /** 06:00 WAT daily HARD_LOCK for all terminals (scheduled). */
  async applyDailyWatHardLock() {
    const now = new Date();
    const res = await this.prisma.posTerminal.updateMany({
      data: {
        lockState: TERMINAL_LOCK_HARD,
        lastDailyLockAt: now,
      },
    });
    const orgRows = await this.prisma.posTerminal.findMany({
      distinct: ["orgId"],
      select: { orgId: true },
    });
    for (const { orgId } of orgRows.length ? orgRows : [{ orgId: "default" }]) {
      await this.prisma.setOrgContext(orgId);
      await this.prisma.terminalTcpLedger.create({
        data: {
          orgId,
          terminalId: "_system_",
          eventType: "DAILY_HARD_LOCK_WAT_06",
          payloadJson: JSON.stringify({ updatedCount: res.count, at: now.toISOString() }),
        },
      });
    }
    return res.count;
  }

  /** HARD_LOCK after configured inactivity while UNLOCKED. */
  async applyInactivityHardLock() {
    const cutoff = new Date(Date.now() - this.inactivityMs());
    const victims = await this.prisma.posTerminal.findMany({
      where: {
        lockState: TERMINAL_UNLOCKED,
        lastActivityAt: { lt: cutoff },
      },
      select: { id: true, terminalId: true, orgId: true },
    });
    for (const v of victims) {
      await this.prisma.posTerminal.update({
        where: { id: v.id },
        data: { lockState: TERMINAL_LOCK_HARD },
      });
      await this.appendTcpLedger(v.orgId, v.terminalId, "INACTIVITY_HARD_LOCK", {
        inactivityMs: this.inactivityMs(),
      });
    }
    return victims.length;
  }

  async getStatus(terminalId: string, orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const t = await this.prisma.posTerminal.findFirst({ where: { terminalId, orgId } });
    if (!t) throw new NotFoundException("Unknown terminal");
    return {
      terminalId: t.terminalId,
      lockState: t.lockState,
      lastActivityAt: t.lastActivityAt,
      consecutiveFailedUnlocks: t.consecutiveFailedUnlocks,
      stealthCaptureAt: t.stealthCaptureAt,
      lastDailyLockAt: t.lastDailyLockAt,
    };
  }
}
