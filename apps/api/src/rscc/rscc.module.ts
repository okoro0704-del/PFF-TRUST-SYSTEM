import { Module } from "@nestjs/common";
import { RsccLicenseService } from "./rscc-license.service";
import { RsccSwitchingService } from "./rscc-switching.service";
import { RsccAjoService } from "./rscc-ajo.service";
import { RsccDistributionService } from "./rscc-distribution.service";
import { RsccController } from "./rscc.controller";

/**
 * RsccModule — Revenue & Settlement Command Center
 *
 * Dependency graph (acyclic — no cross-module imports):
 *   RsccLicenseService     → PrismaService  (reads BankApplication, BankLicense, DedicatedAccountBalance)
 *   RsccSwitchingService   → PrismaService  (reads/writes SwitchingToll)
 *   RsccAjoService         → PrismaService  (reads/writes AjoAccount)
 *   RsccDistributionService → PrismaService (reads AjoAccount, AgentLiquidityDistribution, DedicatedAccountBalance, AdminRedFlag)
 *
 * OnModuleInit seeding order (NestJS processes in declaration order):
 *   1. RsccLicenseService     — seeds BankLicense + DedicatedAccountBalance (requires BankApplication from CASD)
 *   2. RsccSwitchingService   — seeds SwitchingToll (standalone synthetic records)
 *   3. RsccAjoService         — seeds AjoAccount + AJO_SAFE_BREAK flags
 *   4. RsccDistributionService — seeds AgentLiquidityDistribution (requires AjoAccount from step 3)
 *
 * Import CasdModule before RsccModule in app.module.ts to ensure BankApplication seed runs first.
 */
@Module({
  controllers: [RsccController],
  providers: [
    RsccLicenseService,
    RsccSwitchingService,
    RsccAjoService,
    RsccDistributionService,
  ],
  exports: [RsccLicenseService, RsccDistributionService],
})
export class RsccModule {}

