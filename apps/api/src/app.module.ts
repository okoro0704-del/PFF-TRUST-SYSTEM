import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { SentinelModule } from "./sentinel/sentinel.module";
import { VerificationModule } from "./verification/verification.module";
import { AdminModule } from "./admin/admin.module";
import { TerminalModule } from "./terminal/terminal.module";
import { ExecutionModule } from "./execution/execution.module";
import { UnbankedModule } from "./unbanked/unbanked.module";
import { SavingsModule } from "./savings/savings.module";
import { BepwgModule } from "./bepwg/bepwg.module";
import { LbasModule } from "./lbas/lbas.module";
import { UnwpModule } from "./unwp/unwp.module";
import { ZfoeModule } from "./zfoe/zfoe.module";
import { BihModule } from "./bih/bih.module";
import { BlsModule } from "./bls/bls.module";
import { BlideModule } from "./blide/blide.module";
import { CasdModule } from "./casd/casd.module";
import { RsccModule } from "./rscc/rscc.module";
import { RedisModule } from "./redis/redis.module";
import { ZfpsModule } from "./zfps/zfps.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SentinelModule,
    VerificationModule,
    AdminModule,
    TerminalModule,
    ExecutionModule,
    UnbankedModule,
    SavingsModule,
    BepwgModule,
    LbasModule,
    UnwpModule,
    ZfoeModule,
    BihModule,
    BlsModule,
    BlideModule,
    CasdModule,
    RsccModule,
    RedisModule,
    ZfpsModule,
    SupabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
