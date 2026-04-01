import { Global, Module } from "@nestjs/common";
import { SentinelService } from "./sentinel.service";

@Global()
@Module({
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
