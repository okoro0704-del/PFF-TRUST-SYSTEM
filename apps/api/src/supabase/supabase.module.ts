import { Global, Module } from "@nestjs/common";
import { SupabaseService } from "./supabase.service";

/**
 * Global module — import once in AppModule, available everywhere.
 * SupabaseService can be injected into any service that needs to
 * broadcast realtime events or upload documents to Supabase Storage.
 */
@Global()
@Module({
  providers: [SupabaseService],
  exports:   [SupabaseService],
})
export class SupabaseModule {}

