import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Length, Matches } from "class-validator";
import { ZfpsOrchestratorService, ZfpsProvisionRequest } from "./zfps-orchestrator.service";
import { BankLatencyMonitorService } from "./bank-latency-monitor.service";
import { SmsNotificationService } from "./sms-notification.service";

class ProvisionDto implements ZfpsProvisionRequest {
  @ApiProperty({ example: "sess_abc123" }) @IsString() sessionRef!: string;
  @ApiProperty({ example: "NIBSS-TOKEN-XYZ" }) @IsString() nibssTokenId!: string;
  @ApiProperty({ example: "NIBSS-MATCH-456" }) @IsString() nibssMatchId!: string;
  @ApiProperty({ example: "058063220" }) @IsString() bankCode!: string;
  @ApiProperty({ enum: ["SAVINGS","CURRENT"] }) @IsEnum(["SAVINGS","CURRENT"]) accountType!: "SAVINGS" | "CURRENT";
  @ApiProperty({ example: "Adaeze" }) @IsString() firstName!: string;
  @ApiProperty({ example: "Nwosu" }) @IsString() lastName!: string;
  @ApiPropertyOptional({ example: "Chioma" }) @IsOptional() @IsString() middleName?: string;
  @ApiProperty({ example: "1992-07-14" }) @IsString() dateOfBirth!: string;
  @ApiProperty({ enum: ["M","F"] }) @IsEnum(["M","F"]) gender!: "M" | "F";
  @ApiProperty({ example: "12 Marina Road, Ikeja, Lagos" }) @IsString() address!: string;
  @ApiProperty({ example: "Lagos" }) @IsString() stateOfOrigin!: string;
  @ApiProperty({ example: "22345678901" }) @IsString() @Length(11,11) bvn!: string;
  @ApiProperty({ example: "+2348012345678" }) @IsString() @Matches(/^\+?[0-9]{10,15}$/) phoneNumber!: string;
  @ApiPropertyOptional({ example: "default" }) @IsOptional() @IsString() orgId?: string;
}

/**
 * ZfpsController — Zero-Friction Provisioning Stack REST API
 *
 * POST /v1/zfps/provision       — Full NIBSS→ISO20022→CBS→SMS account opening
 * GET  /v1/zfps/pulse           — Today's provisioning metrics (count/rate/latency/SMS/vault)
 * GET  /v1/zfps/events          — Recent provisioning audit trail
 * GET  /v1/zfps/latency         — Per-bank CBS latency dashboard (24h, moving avg)
 * GET  /v1/zfps/sms-log         — Recent SMS delivery log
 *
 * gRPC equivalent: see src/zfps/proto/zfps.proto (ZfpsService)
 * Internal calls from BLIDE / ZFOE / BIH modules use ZfpsOrchestratorService directly (DI).
 */
@ApiTags("zfps")
@Controller("v1/zfps")
export class ZfpsController {
  constructor(
    private readonly orchestrator: ZfpsOrchestratorService,
    private readonly monitor:      BankLatencyMonitorService,
    private readonly smsService:   SmsNotificationService,
  ) {}

  @ApiOperation({
    summary: "Trigger Zero-Friction Account Provisioning.",
    description:
      "Full ZFPS pipeline: " +
      "(1) Open 60s Redis NDPR vault → " +
      "(2) Build ISO 20022 acmt.001.001.08 message → " +
      "(3) Push to bank CBS with latency monitoring → " +
      "(4) Invalidate vault → " +
      "(5) Write audit trail → " +
      "(6) Deliver account number via Termii SMS. " +
      "Target: sub-60s end-to-end mandate.",
  })
  @Post("provision")
  provision(@Body() dto: ProvisionDto) {
    return this.orchestrator.provision(dto);
  }

  @ApiOperation({
    summary: "Provisioning Pulse — today's metrics.",
    description:
      "Returns: todayCount, successRate%, avgCbsLatencyMs, smsRate%, " +
      "mandateMetRate%, vaultMode (LIVE|FALLBACK).",
  })
  @Get("pulse")
  pulse(@Query("orgId") orgId = "default") {
    return this.orchestrator.getProvisioningPulse(orgId);
  }

  @ApiOperation({ summary: "Recent ZFPS provisioning events — full audit trail with masked account numbers." })
  @Get("events")
  events(@Query("orgId") orgId = "default", @Query("limit") limit = "20") {
    return this.orchestrator.getRecentEvents(orgId, parseInt(limit, 10));
  }

  @ApiOperation({
    summary: "Bank CBS latency dashboard.",
    description:
      "Per-bank 24h moving-average latency. " +
      "trafficLight: GREEN (<5s) | AMBER (<20s) | RED (>20s). " +
      "alertThresholdMs default: 45,000ms (configurable via ZFPS_LATENCY_ALERT_MS).",
  })
  @Get("latency")
  latency(@Query("orgId") orgId = "default") {
    return this.monitor.getLatencyDashboard(orgId);
  }

  @ApiOperation({ summary: "Recent SMS delivery log — masked recipient, provider, status." })
  @Get("sms-log")
  smsLog(@Query("orgId") orgId = "default", @Query("limit") limit = "20") {
    return this.smsService.getRecentLogs(orgId, parseInt(limit, 10));
  }
}

