import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import { ProximityService } from "./proximity.service";
import { OFFLINE_CACHE_TTL_HOURS, PROXIMITY_RADIUS_M } from "./bepwg.constants";
import type { RegisterLocationDto } from "./dto/register-location.dto";

/**
 * LocationAnchorService — manages the GPS reference points used by the 10m Rule.
 *
 * Each customer has exactly one anchor (upsert semantics).
 * The anchor is stored alongside an AES-256-GCM encrypted offline cache blob
 * for POS devices that need to validate proximity without network access.
 */
@Injectable()
export class LocationAnchorService {
  constructor(
    private readonly prisma:     PrismaService,
    private readonly config:     ConfigService,
    private readonly proximity:  ProximityService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /**
   * Register or update a customer's location anchor.
   * Regenerates the offline cache blob on every update.
   * Returns the offline token (HMAC-signed) for the POS to store locally.
   */
  async registerAnchor(dto: RegisterLocationDto) {
    const orgId         = dto.orgId ?? "default";
    const customerHash  = this.bvnHash(dto.customerBvn);
    await this.prisma.setOrgContext(orgId);

    const now       = new Date();
    const validUntil = new Date(now.getTime() + OFFLINE_CACHE_TTL_HOURS * 3600 * 1000);
    const cachePayload = {
      customerBvnHash: customerHash,
      latitudeDeg:     dto.latitudeDeg,
      longitudeDeg:    dto.longitudeDeg,
      generatedAt:     now.toISOString(),
      validUntil:      validUntil.toISOString(),
    };

    const blob  = this.proximity.generateOfflineBlob(cachePayload);
    const token = this.proximity.mintOfflineToken(cachePayload);

    await this.prisma.locationAnchor.upsert({
      where:  { customerBvnHash: customerHash },
      create: {
        customerBvnHash:  customerHash,
        tfanId:           dto.tfanId ?? null,
        latitudeDeg:      new Decimal(dto.latitudeDeg.toFixed(7)),
        longitudeDeg:     new Decimal(dto.longitudeDeg.toFixed(7)),
        offlineCacheBlob: blob,
        orgId,
      },
      update: {
        latitudeDeg:      new Decimal(dto.latitudeDeg.toFixed(7)),
        longitudeDeg:     new Decimal(dto.longitudeDeg.toFixed(7)),
        offlineCacheBlob: blob,
        tfanId:           dto.tfanId ?? undefined,
      },
    });

    return {
      customerBvnHash: customerHash,
      latitudeDeg:     dto.latitudeDeg,
      longitudeDeg:    dto.longitudeDeg,
      offlineTokenValidUntil: validUntil.toISOString(),
      offlineCacheToken: token,
      message: "Location anchor registered. Store offlineCacheToken on the POS device for offline withdrawals.",
    };
  }

  /**
   * Retrieve anchor coordinates and issue a fresh offline token.
   * Called by the POS at heartbeat or network-available windows.
   */
  async getAnchorAndFreshToken(customerBvnHash: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const anchor = await this.prisma.locationAnchor.findUnique({ where: { customerBvnHash } });
    if (!anchor) throw new BadRequestException("No location anchor registered for this customer");

    const now        = new Date();
    const validUntil = new Date(now.getTime() + OFFLINE_CACHE_TTL_HOURS * 3600 * 1000);
    const cachePayload = {
      customerBvnHash,
      latitudeDeg:    Number(anchor.latitudeDeg),
      longitudeDeg:   Number(anchor.longitudeDeg),
      generatedAt:    now.toISOString(),
      validUntil:     validUntil.toISOString(),
    };
    const token = this.proximity.mintOfflineToken(cachePayload);

    return {
      customerBvnHash,
      latitudeDeg:    Number(anchor.latitudeDeg),
      longitudeDeg:   Number(anchor.longitudeDeg),
      capturedAt:     anchor.capturedAt,
      offlineCacheToken: token,
      offlineTokenValidUntil: validUntil.toISOString(),
    };
  }

  /**
   * Server-side proximity check — used for online withdrawals.
   * Loads the stored anchor and computes Haversine distance.
   */
  async checkProximity(customerBvnHash: string, deviceLat: number, deviceLon: number, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const anchor = await this.prisma.locationAnchor.findUnique({ where: { customerBvnHash } });
    if (!anchor) {
      // No anchor = can't enforce proximity; force bypass path
      return { withinProximity: false, distanceM: Infinity, anchorExists: false };
    }
    const result = this.proximity.checkProximity(
      deviceLat, deviceLon,
      Number(anchor.latitudeDeg), Number(anchor.longitudeDeg),
      PROXIMITY_RADIUS_M,
    );
    return { ...result, anchorExists: true };
  }
}

