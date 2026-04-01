import { Module } from "@nestjs/common";
import { BepwgModule } from "../bepwg/bepwg.module";
import { SavingsCycleService } from "./savings-cycle.service";
import { AgentIncentiveService } from "./agent-incentive.service";
import { WithdrawalGateService } from "./withdrawal-gate.service";
import { SavingsController } from "./savings.controller";

@Module({
  // BepwgModule is imported to make TrustedAgentService available to SavingsCycleService.
  // This seeds the Trusted Link at cycle open — a BEPWG prerequisite for standard withdrawals.
  imports: [BepwgModule],
  controllers: [SavingsController],
  providers: [
    SavingsCycleService,
    AgentIncentiveService,
    WithdrawalGateService,
  ],
  exports: [SavingsCycleService, AgentIncentiveService],
})
export class SavingsModule {}

