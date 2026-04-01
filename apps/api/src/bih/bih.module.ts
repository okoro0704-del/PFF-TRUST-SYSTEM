import { Module } from "@nestjs/common";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { NibssSearchService } from "./nibss-search.service";
import { BihScanService } from "./bih-scan.service";
import { BihGateService } from "./bih-gate.service";
import { BihController } from "./bih.controller";

/**
 * BihModule — Biometric Identity Harvest & Instant Account Mint
 *
 * Dependency graph (acyclic):
 *   BihModule → ZfoeModule.BankDirectoryService (reuses CBS push + National Bank Grid)
 *   BihModule does NOT import NibssFactory (uses its own NibssSearchService for 1:N search)
 *   BihModule does NOT import LbasModule, UnwpModule, or ZfoeModule as a whole module
 *     to avoid circular dependency — BankDirectoryService is injected directly.
 */
@Module({
  controllers: [BihController],
  providers: [
    BankDirectoryService,
    NibssSearchService,
    BihScanService,
    BihGateService,
  ],
  exports: [
    NibssSearchService,
    BihScanService,
  ],
})
export class BihModule {}

