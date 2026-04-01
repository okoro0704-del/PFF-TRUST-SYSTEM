import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { MatchOutcome } from "@bsss/domain";
import { PrismaService } from "../prisma/prisma.service";
import { NibssFactory } from "../nibss/nibss.factory";
import { LbasAuditService } from "./lbas-audit.service";
import type { RegisterSensorDto } from "./dto/register-sensor.dto";
import type { SubmitFingerprintDto } from "./dto/submit-fingerprint.dto";
import {
  EVT_FP_SUBMITTED, EVT_SENSOR_REGISTERED,
  SENSOR_ACTIVE, SENSOR_REGISTERED, SENSOR_REVOKED,
} from "./lbas.constants";

/**
 * FingerprintAbstractionService — Universal FAP-20 External Sensor Layer.
 *
 * Decouples biometric matching from the mobile device's built-in sensor.
 * Supports Dermalog LF10, SecuGen Hamster, Aratek A600, and generic FAP-20 devices
 * connected via USB or Bluetooth to the POS terminal or mobile phone.
 *
 * Data flow:
 *   External sensor → ISO/WSQ minutiae → Base64 → BSSS API → NIBSS FAS gate
 *
 * Raw biometric data is never persisted — only the NIBSS match outcome is stored.
 */
@Injectable()
export class FingerprintAbstractionService {
  private readonly log = new Logger(FingerprintAbstractionService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
    private readonly nibss:   NibssFactory,
    private readonly audit:   LbasAuditService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /**
   * Register a FAP-20 external sensor.
   * Uses upsert: re-registering a known deviceId updates its model/protocol and resets status to REGISTERED.
   */
  async registerSensor(dto: RegisterSensorDto) {
    const orgId      = dto.orgId ?? "default";
    const agentHash  = this.bvnHash(dto.agentBvn);
    await this.prisma.setOrgContext(orgId);

    const existing = await this.prisma.externalSensorSession.findUnique({ where: { deviceId: dto.deviceId } });
    if (existing?.status === SENSOR_REVOKED) {
      throw new BadRequestException(`Sensor ${dto.deviceId} has been revoked and cannot be re-registered`);
    }

    const sensor = await this.prisma.externalSensorSession.upsert({
      where:  { deviceId: dto.deviceId },
      create: {
        deviceId:         dto.deviceId,
        sensorModel:      dto.sensorModel,
        sensorProtocol:   dto.sensorProtocol,
        status:           SENSOR_REGISTERED,
        bindingAgentHash: agentHash,
        orgId,
      },
      update: {
        sensorModel:      dto.sensorModel,
        sensorProtocol:   dto.sensorProtocol,
        status:           SENSOR_REGISTERED,
        bindingAgentHash: agentHash,
      },
    });

    await this.audit.log({
      eventType:    EVT_SENSOR_REGISTERED,
      sessionRef:   dto.deviceId,
      agentBvnHash: agentHash,
      orgId,
      metadata:     { sensorModel: dto.sensorModel, sensorProtocol: dto.sensorProtocol },
    });

    return {
      deviceId:     sensor.deviceId,
      sensorModel:  sensor.sensorModel,
      status:       sensor.status,
      registeredAt: sensor.registeredAt,
      message:      `FAP-20 sensor registered. Use POST /v1/lbas/fingerprint/submit to match fingerprints.`,
    };
  }

  /**
   * Submit external fingerprint minutiae to the NIBSS gate for matching.
   *
   * Steps:
   *   1. Validate sensor is registered and not revoked.
   *   2. Decode base64 template.
   *   3. Forward to NIBSS biometric port (NibssFactory).
   *   4. Mark sensor lastUsedAt + status ACTIVE.
   *   5. Log event (no raw biometric in log).
   *   6. Return fingerprint match: YES / NO.
   */
  async submitExternalMinutiae(dto: SubmitFingerprintDto) {
    const orgId        = dto.orgId ?? "default";
    const customerHash = this.bvnHash(dto.customerBvn);
    await this.prisma.setOrgContext(orgId);

    const sensor = await this.prisma.externalSensorSession.findUnique({ where: { deviceId: dto.deviceId } });
    if (!sensor) throw new BadRequestException(`Sensor ${dto.deviceId} is not registered`);
    if (sensor.status === SENSOR_REVOKED) throw new BadRequestException(`Sensor ${dto.deviceId} is revoked`);

    // Decode and submit to NIBSS
    const fpBuffer = Buffer.from(dto.fingerprintTemplateB64, "base64");
    const bundle   = this.nibss.create();
    const result   = await bundle.biometric.verifyFingerprint(dto.customerBvn, fpBuffer);
    const matched  = result.outcome === MatchOutcome.MatchFound;

    // Mark sensor active + update lastUsedAt
    await this.prisma.externalSensorSession.update({
      where: { deviceId: dto.deviceId },
      data:  { status: SENSOR_ACTIVE, lastUsedAt: new Date() },
    });

    await this.audit.log({
      eventType:       EVT_FP_SUBMITTED,
      sessionRef:      dto.deviceId,
      customerBvnHash: customerHash,
      orgId,
      metadata: {
        sensorModel:        sensor.sensorModel,
        templateFormat:     dto.templateFormat,
        fingerprintMatch:   matched,
        nibssOutcome:       result.outcome,
        nibssCorrelationId: result.correlationId,
      },
    });

    this.log.log(`[LBAS][fp] deviceId=${dto.deviceId} match=${matched} correlationId=${result.correlationId}`);

    return {
      deviceId:           dto.deviceId,
      sensorModel:        sensor.sensorModel,
      fingerprintMatch:   matched ? "YES" : "NO",
      nibssOutcome:       result.outcome,
      nibssCorrelationId: result.correlationId,
      templateFormat:     dto.templateFormat,
    };
  }

  async getSensorStatus(deviceId: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const s = await this.prisma.externalSensorSession.findUnique({ where: { deviceId } });
    if (!s) throw new BadRequestException(`Sensor ${deviceId} not found`);
    return { deviceId: s.deviceId, sensorModel: s.sensorModel, status: s.status,
      sensorProtocol: s.sensorProtocol, registeredAt: s.registeredAt, lastUsedAt: s.lastUsedAt };
  }
}

