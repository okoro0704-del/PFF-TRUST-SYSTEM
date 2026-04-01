import { Module } from "@nestjs/common";
import { VerificationModule } from "../verification/verification.module";
import { BiometricExecutionService } from "./biometric-execution.service";
import { ExecutionProofService } from "./execution-proof.service";
import { HsmBiometricService } from "./hsm-biometric.service";
import { PulseSyncService } from "./pulse-sync.service";
import { AccountExecutionService } from "./account-execution.service";
import { TransferExecutionService } from "./transfer-execution.service";
import { WithdrawExecutionService } from "./withdraw-execution.service";
import { BillsExecutionService } from "./bills-execution.service";
import { TokenExpirySweeper } from "./token-expiry.scheduler";
import {
  AccountExecutionController,
  BillsExecutionController,
  ExecutionProofController,
  TransferExecutionController,
  WithdrawExecutionController,
} from "./execution.controllers";

@Module({
  imports: [VerificationModule],
  controllers: [
    AccountExecutionController,
    TransferExecutionController,
    WithdrawExecutionController,
    BillsExecutionController,
    ExecutionProofController,
  ],
  providers: [
    HsmBiometricService,
    ExecutionProofService,
    BiometricExecutionService,
    PulseSyncService,
    AccountExecutionService,
    TransferExecutionService,
    WithdrawExecutionService,
    BillsExecutionService,
    TokenExpirySweeper,
  ],
  exports: [PulseSyncService, BiometricExecutionService, TokenExpirySweeper],
})
export class ExecutionModule {}
