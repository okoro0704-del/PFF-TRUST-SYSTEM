import { Module } from "@nestjs/common";
import { CasdBankPipelineService } from "./casd-bank-pipeline.service";
import { CasdSovereignVaultService } from "./casd-sovereign-vault.service";
import { CasdMetricsService } from "./casd-metrics.service";
import { CasdController } from "./casd.controller";

/**
 * CasdModule — Command Center: Master Admin & Settlement Dashboard
 *
 * Dependency graph (acyclic):
 *   CasdBankPipelineService  → CasdSovereignVaultService (auto push-to-bank on approval)
 *   CasdMetricsService       → PrismaService only (cross-module aggregate queries)
 *   No circular imports.
 *
 * Both BankPipelineService and SovereignVaultService implement OnModuleInit
 * to seed demo data (bank applications + 6 sovereign documents) on first boot.
 */
@Module({
  controllers: [CasdController],
  providers: [
    CasdSovereignVaultService,  // must be declared before BankPipelineService (dependency)
    CasdBankPipelineService,
    CasdMetricsService,
  ],
  exports: [CasdMetricsService],
})
export class CasdModule {}

