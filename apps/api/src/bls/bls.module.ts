import { Module } from "@nestjs/common";
import { NibssSearchService } from "../bih/nibss-search.service";
import { BlsDiscoveryService } from "./bls-discovery.service";
import { BlsSealService } from "./bls-seal.service";
import { BlsController } from "./bls.controller";

/**
 * BlsModule — Biometric Liquidity Sweep & Two-Step Authorization
 *
 * Dependency graph (acyclic):
 *   BlsModule → BihModule.NibssSearchService (reuses 1:N fingerprint search + AES-GCM crypto)
 *   BlsModule does NOT import BankDirectoryService (BLS is withdrawal-only, no CBS account creation)
 *   BlsModule does NOT import ZfoeModule or BihModule as whole modules
 *
 * NibssSearchService is imported directly (not via BihModule) to avoid circular dependency.
 */
@Module({
  controllers: [BlsController],
  providers: [
    NibssSearchService,
    BlsDiscoveryService,
    BlsSealService,
  ],
  exports: [BlsDiscoveryService],
})
export class BlsModule {}

