import { Module } from "@nestjs/common";
import { UnbankedController } from "./unbanked.controller";
import { UnbankedCaptureService } from "./unbanked-capture.service";
import { NibssPushService } from "./nibss-push.service";
import { NibssPackager } from "./nibss-packager";
import { BankabilityService } from "./bankability.service";
import { WatchEyeSyncService } from "./watch-eye-sync.service";
import { StubLivenessService } from "../liveness/liveness.service";

@Module({
  controllers: [UnbankedController],
  providers: [
    UnbankedCaptureService,
    NibssPushService,
    NibssPackager,
    BankabilityService,
    WatchEyeSyncService,
    StubLivenessService,
  ],
  exports: [BankabilityService, UnbankedCaptureService, WatchEyeSyncService],
})
export class UnbankedModule {}

