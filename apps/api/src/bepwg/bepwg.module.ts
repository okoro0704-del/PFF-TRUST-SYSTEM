import { Module } from "@nestjs/common";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { ProximityService } from "./proximity.service";
import { LocationAnchorService } from "./location-anchor.service";
import { TrustedAgentService } from "./trusted-agent.service";
import { BepwgGateService } from "./bepwg-gate.service";
import { BepwgController } from "./bepwg.controller";

@Module({
  controllers: [BepwgController],
  providers: [
    NibssFactory,
    StubLivenessService,
    ProximityService,
    LocationAnchorService,
    TrustedAgentService,
    BepwgGateService,
  ],
  exports: [LocationAnchorService, TrustedAgentService, BepwgGateService],
})
export class BepwgModule {}

