import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { CBS_ACCOUNT_OPENING, DEFAULT_LATENCY_ALERT_MS } from "./zfps.constants";

export interface WrappedResult<T> {
  result:         T;
  latencyMs:      number;
  succeeded:      boolean;
  alertTriggered: boolean;
}

/**
 * BankLatencyMonitorService — wraps every CBS API call with:
 *   1. High-resolution timer (performance.now)
 *   2. BankApiLatencyLog DB record per call
 *   3. Redis sliding-window update (last 10 latencies per bank)
 *   4. Moving-average check → AdminRedFlag(HIGH) if avg > threshold AND
 *      no identical flag raised in the last 60 minutes
 *
 * Alert threshold: ZFPS_LATENCY_ALERT_MS env var (default 45,000 ms)
 */
@Injectable()
export class BankLatencyMonitorService {
  private readonly log       = new Logger(BankLatencyMonitorService.name);
  private readonly alertMs: number;

  constructor(
    private readonly prisma:  PrismaService,
    private readonly redis:   RedisService,
    private readonly config:  ConfigService,
  ) {
    this.alertMs = parseInt(this.config.get("ZFPS_LATENCY_ALERT_MS") ?? String(DEFAULT_LATENCY_ALERT_MS), 10);
  }

  /** Wrap any async bank CBS call with full timing + alerting. */
  async wrapCbsCall<T>(
    bankCode:      string,
    bankName:      string,
    sessionRef:    string,
    fn:            () => Promise<T>,
    operationType  = CBS_ACCOUNT_OPENING,
    orgId          = "default",
  ): Promise<WrappedResult<T>> {
    await this.prisma.setOrgContext(orgId);
    const start = performance.now();
    let result!: T;
    let succeeded = false;
    let statusCode: number | undefined;

    try {
      result    = await fn();
      succeeded = true;
      statusCode = 200;
    } catch (err) {
      statusCode = 500;
      throw err;
    } finally {
      const latencyMs      = Math.round(performance.now() - start);
      const alertTriggered = succeeded ? await this.checkAndAlert(bankCode, bankName, latencyMs, orgId) : false;

      // Write latency log (fire-and-forget — don't block provisioning)
      this.prisma.bankApiLatencyLog.create({
        data: {
          bankCode, bankName, sessionRef, operationType,
          latencyMs, statusCode, succeeded, alertTriggered, orgId,
        },
      }).catch(e => this.log.warn(`[Latency] DB write failed: ${String(e)}`));

      // Update Redis sliding window
      this.redis.recordLatency(bankCode, latencyMs)
        .catch(e => this.log.warn(`[Latency] Redis write failed: ${String(e)}`));

      this.log.log(`[Latency] ${bankName} ${operationType} ${latencyMs}ms ${succeeded ? "✓" : "✗"}${alertTriggered ? " ⚠ ALERT" : ""}`);
    }

    return { result, latencyMs: Math.round(performance.now() - start), succeeded, alertTriggered: false };
  }

  private async checkAndAlert(bankCode: string, bankName: string, latencyMs: number, orgId: string): Promise<boolean> {
    // Get recent DB readings + current to compute moving average
    const recentLogs = await this.prisma.bankApiLatencyLog.findMany({
      where: { bankCode, succeeded: true },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { latencyMs: true },
    });
    const samples = [latencyMs, ...recentLogs.map(l => l.latencyMs)];
    const avg     = samples.reduce((s, v) => s + v, 0) / samples.length;

    if (avg <= this.alertMs) return false;

    // Suppress duplicate flags within 60 minutes
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const existing   = await this.prisma.adminRedFlag.count({
      where: { bankCode, flagType: "SWITCHING_ANOMALY", isResolved: false, createdAt: { gte: oneHourAgo } },
    });
    if (existing > 0) return false;

    await this.prisma.adminRedFlag.create({
      data: {
        flagType: "SWITCHING_ANOMALY", severity: "HIGH",
        bankCode, bankName, orgId,
        message:
          `⚠️ Bank API Latency Alert: ${bankName} CBS moving average ${Math.round(avg)}ms exceeds ${this.alertMs}ms threshold (${samples.length} samples). ` +
          `Admin should verify bank API health and consider fallback routing.`,
      },
    });
    this.log.warn(`[Latency] 🚨 AdminRedFlag created — ${bankName} avg ${Math.round(avg)}ms > ${this.alertMs}ms`);
    return true;
  }

  /** Per-bank latency dashboard — used by ZFPS pulse monitor. */
  async getLatencyDashboard(orgId = "default") {
    await this.prisma.setOrgContext(orgId);

    // Aggregate per-bank from DB (last 24h)
    const since = new Date(Date.now() - 86_400_000);
    const logs  = await this.prisma.bankApiLatencyLog.findMany({
      where: { createdAt: { gte: since }, succeeded: true },
      select: { bankCode: true, bankName: true, latencyMs: true, alertTriggered: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const banks = new Map<string, { name: string; samples: number[]; alerts: number; lastMs: number; lastAt: Date }>();
    for (const l of logs) {
      const entry = banks.get(l.bankCode) ?? { name: l.bankName, samples: [], alerts: 0, lastMs: 0, lastAt: l.createdAt };
      entry.samples.push(l.latencyMs);
      if (l.alertTriggered) entry.alerts++;
      if (l.createdAt >= entry.lastAt) { entry.lastMs = l.latencyMs; entry.lastAt = l.createdAt; }
      banks.set(l.bankCode, entry);
    }

    const rows = [...banks.entries()].map(([code, b]) => {
      const avg = b.samples.length ? Math.round(b.samples.reduce((s, v) => s + v, 0) / b.samples.length) : 0;
      const min = b.samples.length ? Math.min(...b.samples) : 0;
      const max = b.samples.length ? Math.max(...b.samples) : 0;
      const trafficLight = avg === 0 ? "GREY" : avg < 5_000 ? "GREEN" : avg < 20_000 ? "AMBER" : "RED";
      return { bankCode: code, bankName: b.name, avgMs: avg, minMs: min, maxMs: max, lastMs: b.lastMs, callCount: b.samples.length, alertCount: b.alerts, trafficLight };
    });

    return { banks: rows, alertThresholdMs: this.alertMs, windowHours: 24 };
  }
}

