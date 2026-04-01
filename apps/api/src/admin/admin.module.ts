import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { UnbankedModule } from "../unbanked/unbanked.module";
import { BepwgModule } from "../bepwg/bepwg.module";

@Module({
  // UnbankedModule: BankabilityService for force-bankability
  // BepwgModule:    LocationAnchorService + TrustedAgentService for BEPWG audit queries
  imports:     [UnbankedModule, BepwgModule],
  controllers: [AdminController],
  providers:   [AdminService],
})
export class AdminModule {}
