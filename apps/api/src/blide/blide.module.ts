import { Module } from "@nestjs/common";
import { BankDirectoryService } from "../zfoe/bank-directory.service";
import { NibssFaceService } from "./nibss-face.service";
import { BlideLivenessService } from "./blide-liveness.service";
import { BlideExecutionService } from "./blide-execution.service";
import { BlideController } from "./blide.controller";

/**
 * BlideModule — Biometric Liveness & Identity Discovery Engine
 *
 * Dependency graph (acyclic):
 *   BlideModule → ZfoeModule.BankDirectoryService  (CBS push for Account Setup)
 *   BlideModule → NibssFaceService                 (face-specific AES-GCM crypto + NIBSS 1:N face search)
 *   BlideModule → BlideLivenessService             (challenge engine — anti-replay + zero-knowledge)
 *   BlideModule does NOT import BihModule or BlsModule — keyspaces are fully independent.
 */
@Module({
  controllers: [BlideController],
  providers: [
    BankDirectoryService,
    NibssFaceService,
    BlideLivenessService,
    BlideExecutionService,
  ],
  exports: [BlideExecutionService, NibssFaceService],
})
export class BlideModule {}

