import { Module } from "@nestjs/common";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";
import { PolicyEngineService } from "../policy/policy-engine.service";
import { StubLivenessService } from "../liveness/liveness.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { SecondWatchService } from "./second-watch.service";
import { HsmBiometricService } from "../execution/hsm-biometric.service";

@Module({
  controllers: [VerificationController],
  providers: [
    VerificationService,
    PolicyEngineService,
    StubLivenessService,
    NibssFactory,
    SecondWatchService,
    HsmBiometricService,
  ],
  exports: [VerificationService, NibssFactory, StubLivenessService, SecondWatchService],
})
export class VerificationModule {}
