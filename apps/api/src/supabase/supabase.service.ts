import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * SupabaseService — server-side Supabase admin client.
 *
 * Uses the SERVICE_ROLE key so it bypasses Row-Level Security.
 * Only used for:
 *  - Broadcasting Realtime events to the dashboard
 *  - Storage bucket operations (document upload for CASD sovereign vault)
 *  - Admin-level DB operations that Prisma RLS would block
 *
 * Raw biometric data NEVER passes through this service.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url  = this.config.get<string>("SUPABASE_URL");
    const key  = this.config.get<string>("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !key) {
      this.logger.warn(
        "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — " +
        "SupabaseService running in stub mode (no realtime broadcasts).",
      );
      return;
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    this.logger.log("Supabase admin client initialised ✓");
  }

  /** Returns the admin client, or null if running in stub mode. */
  getClient(): SupabaseClient | null {
    return this.client;
  }

  /**
   * Broadcast a named event on a Realtime channel.
   * Safe to call even in stub mode — logs a warning instead of throwing.
   */
  async broadcast(channel: string, event: string, payload: object): Promise<void> {
    if (!this.client) {
      this.logger.debug(`[stub] broadcast ${channel}:${event} → ${JSON.stringify(payload)}`);
      return;
    }
    const ch = this.client.channel(channel);
    await ch.send({ type: "broadcast", event, payload });
  }

  /**
   * Upload a document buffer to a Supabase Storage bucket.
   * Used by CasdSovereignVaultService for regulatory document storage.
   */
  async uploadDocument(
    bucket: string,
    path: string,
    buffer: Buffer,
    mimeType = "application/octet-stream",
  ): Promise<{ publicUrl: string | null; error: string | null }> {
    if (!this.client) {
      this.logger.warn(`[stub] uploadDocument → bucket=${bucket} path=${path}`);
      return { publicUrl: null, error: "Supabase not configured" };
    }

    const { data, error } = await this.client.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (error) {
      this.logger.error(`Storage upload failed: ${error.message}`);
      return { publicUrl: null, error: error.message };
    }

    const { data: urlData } = this.client.storage.from(bucket).getPublicUrl(data.path);
    return { publicUrl: urlData.publicUrl, error: null };
  }
}

