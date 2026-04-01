import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { TerminalService } from "./terminal.service";

@Injectable()
export class TerminalLockScheduler {
  private readonly log = new Logger(TerminalLockScheduler.name);

  constructor(private readonly terminals: TerminalService) {}

  @Cron("0 6 * * *", { timeZone: "Africa/Lagos" })
  async dailyHardLockWat() {
    const n = await this.terminals.applyDailyWatHardLock();
    this.log.log(`06:00 WAT HARD_LOCK: ${n} terminal row(s) updated`);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async inactivityHardLock() {
    const n = await this.terminals.applyInactivityHardLock();
    if (n > 0) this.log.warn(`Inactivity HARD_LOCK: ${n} terminal(s)`);
  }
}
