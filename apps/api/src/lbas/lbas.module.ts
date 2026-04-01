import { Module } from "@nestjs/common";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { LbasAuditService } from "./lbas-audit.service";
import { LivenessChallengeService } from "./liveness-challenge.service";
import { FingerprintAbstractionService } from "./fingerprint-abstraction.service";
import { NetworklessChallengeService } from "./networkless-challenge.service";
import { LbasController } from "./lbas.controller";

@Module({
  controllers: [LbasController],
  providers: [
    NibssFactory,
    StubLivenessService,
    LbasAuditService,
    LivenessChallengeService,
    FingerprintAbstractionService,
    NetworklessChallengeService,
  ],
  exports: [
    LbasAuditService,
    LivenessChallengeService,
    FingerprintAbstractionService,
    NetworklessChallengeService,
  ],
})
export class LbasModule {}

