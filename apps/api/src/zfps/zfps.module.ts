import { Module } from "@nestjs/common";
import { ZfpsOrchestratorService } from "./zfps-orchestrator.service";
import { BankLatencyMonitorService } from "./bank-latency-monitor.service";
import { SmsNotificationService } from "./sms-notification.service";
import { ZfpsController } from "./zfps.controller";
import { BankDirectoryService } from "../zfoe/bank-directory.service";

/**
 * ZfpsModule — Zero-Friction Provisioning Stack
 *
 * Dependency graph (all acyclic):
 *   ZfpsOrchestratorService  → RedisService (global) + BankDirectoryService + BankLatencyMonitorService + SmsNotificationService
 *   BankLatencyMonitorService → PrismaService (global) + RedisService (global)
 *   SmsNotificationService   → PrismaService (global) + ConfigService (global)
 *   BankDirectoryService     → stateless (no deps)
 *
 * RedisModule is @Global() — imported once in AppModule, auto-available here.
 * PrismaModule is @Global() — same.
 * ConfigModule is @Global() — same.
 *
 * gRPC bootstrap (when ready):
 *   Replace ZfpsController REST routes with a gRPC microservice:
 *   ClientsModule.register([{ name: ZFPS_GRPC_SERVICE, transport: Transport.GRPC, options: {
 *     url: process.env.ZFPS_GRPC_URL, package: ZFPS_GRPC_PACKAGE,
 *     protoPath: ZFPS_GRPC_PROTO_PATH
 *   }}])
 *
 * Export ZfpsOrchestratorService so BLIDE / ZFOE / BIH modules can inject it directly
 * for in-process provisioning without going through HTTP.
 */
@Module({
  controllers: [ZfpsController],
  providers: [
    BankDirectoryService,
    BankLatencyMonitorService,
    SmsNotificationService,
    ZfpsOrchestratorService,
  ],
  exports: [ZfpsOrchestratorService, BankLatencyMonitorService, SmsNotificationService],
})
export class ZfpsModule {}

