import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { TerminalService } from "./terminal.service";
import { BindTerminalDto } from "./dto/bind-terminal.dto";
import { TerminalHeartbeatDto } from "./dto/heartbeat.dto";
import { UnlockTerminalDto } from "./dto/unlock-terminal.dto";

/** Terminal Control Protocol — agent POS binding, lock state, NIBSS unlock (OR-gate). */
@ApiTags("tcp")
@Controller("v1/tcp/terminals")
export class TerminalController {
  constructor(private readonly terminals: TerminalService) {}

  @ApiOperation({ summary: "Bind POS terminal to an enrolled agent BVN — issues HARD_LOCK on first bind" })
  @Post("bind")
  bind(@Body() dto: BindTerminalDto) {
    return this.terminals.bindTerminal(dto);
  }

  @ApiOperation({ summary: "Terminal heartbeat — updates last-activity timestamp, triggers PulseSync batch settlement" })
  @Post(":terminalId/heartbeat")
  heartbeat(@Param("terminalId") terminalId: string, @Body() _body: TerminalHeartbeatDto, @Query("orgId") orgId?: string) {
    return this.terminals.heartbeat(terminalId, orgId ?? _body.orgId);
  }

  @ApiOperation({ summary: "Attempt unlock — NIBSS OR-gate; 3 consecutive failures triggers Sentinel stealth + GPS alert" })
  @Post(":terminalId/unlock")
  unlock(@Param("terminalId") terminalId: string, @Body() dto: UnlockTerminalDto) {
    return this.terminals.attemptUnlock(terminalId, dto);
  }

  @ApiOperation({ summary: "Get terminal status — lock state, failure count, stealth capture timestamp" })
  @Get(":terminalId/status")
  status(@Param("terminalId") terminalId: string, @Query("orgId") orgId = "default") {
    return this.terminals.getStatus(terminalId, orgId);
  }
}
