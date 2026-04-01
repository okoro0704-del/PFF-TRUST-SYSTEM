import { Module } from "@nestjs/common";
import { NibssFactory } from "../nibss/nibss.factory";
import { NibssHarvestService } from "./nibss-harvest.service";
import { BankDirectoryService } from "./bank-directory.service";
import { AccountProvisionService } from "./account-provision.service";
import { ZfoeController } from "./zfoe.controller";

/**
 * ZfoeModule — Zero-Friction Instant Onboarding Engine
 *
 * Dependency graph (acyclic):
 *   ZfoeModule → NibssFactory (biometric gate for Step 3)
 *   ZfoeModule does NOT import BepwgModule, SavingsModule, LbasModule, or UnwpModule
 *
 * NibssHarvestService is exported for potential use by AdminModule audit queries.
 */
@Module({
  controllers: [ZfoeController],
  providers: [
    NibssFactory,
    BankDirectoryService,
    NibssHarvestService,
    AccountProvisionService,
  ],
  exports: [
    NibssHarvestService,
    BankDirectoryService,
  ],
})
export class ZfoeModule {}

