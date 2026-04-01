import { Module } from "@nestjs/common";
import { NibssFactory } from "../nibss/nibss.factory";
import { LbasAuditService } from "../lbas/lbas-audit.service";
import { UnwpSessionService } from "./unwp-session.service";
import { PosOfflineLedgerService } from "./pos-offline-ledger.service";
import { UnwpController } from "./unwp.controller";

/**
 * UnwpModule — Universal Networkless Withdrawal Protocol
 *
 * Dependency graph (no cycles):
 *   UnwpModule → LbasAuditService (from LbasModule providers, re-declared here)
 *   UnwpModule → NibssFactory (biometric escalation failsafe)
 *   UnwpModule does NOT import BepwgModule or SavingsModule
 */
@Module({
  controllers: [UnwpController],
  providers: [
    NibssFactory,
    LbasAuditService,
    UnwpSessionService,
    PosOfflineLedgerService,
  ],
  exports: [
    UnwpSessionService,
    PosOfflineLedgerService,
  ],
})
export class UnwpModule {}

