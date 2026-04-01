import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import {
  LATENCY_WINDOW_SIZE, REDIS_LATENCY_PREFIX,
  REDIS_STATE_PREFIX, REDIS_VAULT_PREFIX,
  SESSION_STATE_TTL_SECONDS, VAULT_TTL_SECONDS,
} from "../zfps/zfps.constants";

interface MemEntry { value: string; expiresAt: number; timer: ReturnType<typeof setTimeout>; }

/**
 * RedisService — NDPR-compliant 60-second identity vault + session state cache.
 *
 * Mode A (Production):  REDIS_URL is set → connects to Redis via ioredis.
 * Mode B (Development): REDIS_URL not set → in-memory Map with setTimeout TTL.
 *
 * Both modes expose identical APIs; the calling code never needs to know which mode is active.
 * Log line "[Redis] mode: LIVE|FALLBACK" is emitted on startup so ops can confirm.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly mem = new Map<string, MemEntry>();
  private mode: "LIVE" | "FALLBACK" = "FALLBACK";

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) { this.log.warn("[Redis] REDIS_URL not set — running in-memory fallback (dev only)"); return; }
    try {
      this.client = new Redis(url, { lazyConnect: true, enableReadyCheck: true, maxRetriesPerRequest: 2 });
      await this.client.connect();
      this.mode = "LIVE";
      this.log.log("[Redis] mode: LIVE ✓");
    } catch (err) {
      this.log.warn(`[Redis] Connection failed — falling back to in-memory: ${String(err)}`);
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => null);
  }

  get vaultMode(): "LIVE" | "FALLBACK" { return this.mode; }

  // ── Vault (NDPR-compliant 60s TTL) ─────────────────────────────────────────

  /** Stage NIBSS identity into the ephemeral vault. Self-destructs after TTL. */
  async setVault(sessionRef: string, data: unknown, ttl = VAULT_TTL_SECONDS) {
    const key   = `${REDIS_VAULT_PREFIX}${sessionRef}`;
    const value = JSON.stringify(data);
    if (this.client) {
      await this.client.setex(key, ttl, value);
    } else {
      this.memSet(key, value, ttl);
    }
  }

  /** Retrieve staged identity. Returns null if TTL has elapsed. */
  async getVault(sessionRef: string): Promise<unknown | null> {
    const key = `${REDIS_VAULT_PREFIX}${sessionRef}`;
    const raw  = this.client ? await this.client.get(key) : this.memGet(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  }

  /** Explicitly wipe vault entry (called immediately after CBS account creation). */
  async invalidateVault(sessionRef: string) {
    const key = `${REDIS_VAULT_PREFIX}${sessionRef}`;
    if (this.client) { await this.client.del(key); }
    else { this.memDel(key); }
  }

  // ── Session State (5-min TTL) ───────────────────────────────────────────────
  async setSessionState(sessionRef: string, state: unknown, ttl = SESSION_STATE_TTL_SECONDS) {
    const key   = `${REDIS_STATE_PREFIX}${sessionRef}`;
    const value = JSON.stringify(state);
    if (this.client) { await this.client.setex(key, ttl, value); }
    else { this.memSet(key, value, ttl); }
  }

  async getSessionState(sessionRef: string): Promise<unknown | null> {
    const key = `${REDIS_STATE_PREFIX}${sessionRef}`;
    const raw  = this.client ? await this.client.get(key) : this.memGet(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  }

  // ── Bank Latency Sliding Window ──────────────────────────────────────────────
  /** Push a new latency sample; keeps last LATENCY_WINDOW_SIZE readings per bank. */
  async recordLatency(bankCode: string, ms: number) {
    const key = `${REDIS_LATENCY_PREFIX}${bankCode}`;
    if (this.client) {
      await this.client.lpush(key, String(ms));
      await this.client.ltrim(key, 0, LATENCY_WINDOW_SIZE - 1);
      await this.client.expire(key, 86_400); // 24h
    } else {
      const existing = this.memGet(key);
      const arr = existing ? (JSON.parse(existing) as number[]) : [];
      arr.unshift(ms);
      this.memSet(key, JSON.stringify(arr.slice(0, LATENCY_WINDOW_SIZE)), 86_400);
    }
  }

  /** Get last N latency samples for a bank (ms). */
  async getRecentLatencies(bankCode: string): Promise<number[]> {
    const key = `${REDIS_LATENCY_PREFIX}${bankCode}`;
    if (this.client) {
      const vals = await this.client.lrange(key, 0, LATENCY_WINDOW_SIZE - 1);
      return vals.map(Number);
    }
    const raw = this.memGet(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  }

  // ── In-Memory Fallback Helpers ──────────────────────────────────────────────
  private memSet(key: string, value: string, ttlSeconds: number) {
    const existing = this.mem.get(key);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => this.mem.delete(key), ttlSeconds * 1000);
    this.mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000, timer });
  }

  private memGet(key: string): string | null {
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { clearTimeout(entry.timer); this.mem.delete(key); return null; }
    return entry.value;
  }

  private memDel(key: string) {
    const entry = this.mem.get(key);
    if (entry) { clearTimeout(entry.timer); this.mem.delete(key); }
  }
}

