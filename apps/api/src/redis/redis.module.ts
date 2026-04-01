import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

/**
 * RedisModule — Global module. Import once in AppModule.
 *
 * Provides RedisService to all other modules without re-importing.
 * Auto-selects LIVE (ioredis) or FALLBACK (in-memory Map) mode based on REDIS_URL.
 *
 * In production: set REDIS_URL=redis://:<password>@<host>:6379
 * In dev:        omit REDIS_URL — in-memory fallback activates automatically.
 */
@Global()
@Module({
  providers: [RedisService],
  exports:   [RedisService],
})
export class RedisModule {}

