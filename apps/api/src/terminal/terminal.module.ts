import { Module } from "@nestjs/common";
import { TerminalController } from "./terminal.controller";
import { TerminalService } from "./terminal.service";
import { TerminalLockScheduler } from "./terminal-lock.scheduler";
import { NibssFactory } from "../nibss/nibss.factory";
import { StubLivenessService } from "../liveness/liveness.service";
import { ExecutionModule } from "../execution/execution.module";

@Module({
  imports: [ExecutionModule],
  controllers: [TerminalController],
  providers: [TerminalService, TerminalLockScheduler, NibssFactory, StubLivenessService],
})
export class TerminalModule {}
