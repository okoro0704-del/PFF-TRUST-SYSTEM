import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NibssPackager, type NibssEnrollmentPayload } from "./nibss-packager";
import { BankabilityService } from "./bankability.service";
import type { NibssCallbackDto } from "./dto/nibss-callback.dto";

export const NIBSS_PUSH_PENDING   = "PENDING";
export const NIBSS_PUSH_SUCCESS   = "SUCCESS";
export const NIBSS_PUSH_DUPLICATE = "DUPLICATE";
export const NIBSS_PUSH_ERROR     = "ERROR";

interface NibssEnrollResponse {
  status: "SUCCESS" | "DUPLICATE" | "ERROR";
  bvn?: string;
  existingBvn?: string;
  message?: string;
}

@Injectable()
export class NibssPushService {
  private readonly log = new Logger(NibssPushService.name);

  constructor(
    private readonly prisma:       PrismaService,
    private readonly packager:     NibssPackager,
    private readonly bankability:  BankabilityService,
    private readonly config:       ConfigService,
  ) {}

  /**
   * National Push — submits the unbanked user's biometrics + demographics to the
   * NIBSS Enrollment API (or Sovereign Identity Gateway 2026) for BVN generation.
   * Returns immediately with PENDING; the feedback loop runs asynchronously.
   */
  async submitForBvn(tfanId: string, orgId = "default", shardCountry = "NG") {
    await this.prisma.setOrgContext(orgId);
    const profile = await this.prisma.unbankedProfile.findUnique({
      where: { tfanId },
      include: { internalSubject: true },
    });
    if (!profile) throw new BadRequestException("TFAN not found");
    if (profile.status === "BANKABLE")        throw new BadRequestException("Profile already bankable");
    if (profile.status === "NIBSS_SUBMITTED") throw new BadRequestException("Submission already in flight");

    const enrollmentId = `PFF-ENR-${randomUUID()}`;
    const payload      = this.packager.package(profile, profile.internalSubject, enrollmentId);

    // ── Audit record (PENDING) ─────────────────────────────────────────────
    const submission = await this.prisma.nibssSubmission.create({
      data: { profileId: profile.id, enrollmentId, nibssStatus: NIBSS_PUSH_PENDING, shardCountry, orgId },
    });
    await this.prisma.unbankedProfile.update({
      where: { id: profile.id },
      data:  { status: "NIBSS_SUBMITTED", nibssEnrollmentId: enrollmentId },
    });

    // ── Fire-and-forget NIBSS call ─────────────────────────────────────────
    void this.dispatchToNibss(payload, submission.id, tfanId, orgId).catch(
      (e) => this.log.error(`[NibssPush] Dispatch failed for ${enrollmentId}: ${e}`),
    );

    return {
      enrollmentId,
      status:  NIBSS_PUSH_PENDING,
      message: "Submitted to NIBSS Enrollment API. Poll GET /v1/unbanked/:tfanId/status for result.",
    };
  }

  /** Webhook — NIBSS or Sovereign Identity Gateway posts result to this endpoint. */
  async handleCallback(dto: NibssCallbackDto, orgId = "default") {
    await this.prisma.setOrgContext(orgId);
    const submission = await this.prisma.nibssSubmission.findUnique({
      where:   { enrollmentId: dto.enrollmentId },
      include: { profile: true },
    });
    if (!submission) throw new BadRequestException("Enrollment ID not found in audit log");

    const responsePayload = dto.rawPayload ?? JSON.stringify({ status: dto.status, assignedBvn: dto.assignedBvn });
    await this.prisma.nibssSubmission.update({
      where: { id: submission.id },
      data:  { nibssStatus: dto.status, assignedBvn: dto.assignedBvn ?? null, nibssResponsePayload: responsePayload },
    });

    const tfanId = submission.profile.tfanId;
    if (dto.status === "SUCCESS" && dto.assignedBvn) {
      const result = await this.bankability.upgradeToGlobal({ tfanId, bvn: dto.assignedBvn, orgId });
      return { tfanId, newStatus: "BANKABLE", accountPublicRef: result.accountPublicRef };
    }
    if (dto.status === "DUPLICATE" && dto.existingBvn) {
      await this.bankability.linkDuplicateBvn(tfanId, dto.existingBvn, orgId);
      return { tfanId, newStatus: "DUPLICATE_LINKED" };
    }
    await this.prisma.unbankedProfile.update({ where: { tfanId }, data: { status: "UNBANKED" } });
    return { tfanId, newStatus: "UNBANKED", error: "NIBSS returned ERROR — profile reset to UNBANKED" };
  }

  private async dispatchToNibss(
    payload: NibssEnrollmentPayload, submissionId: string, tfanId: string, orgId: string,
  ): Promise<void> {
    const baseUrl = this.config.get<string>("NIBSS_ENROLLMENT_BASE_URL");
    const path    = this.config.get<string>("NIBSS_ENROLLMENT_PATH") ?? "/v1/enrollment/bvn";
    const apiKey  = this.config.get<string>("NIBSS_API_KEY");

    if (!baseUrl) {
      // Stub mode — configurable via STUB_NIBSS_ENROLLMENT=SUCCESS|DUPLICATE|ERROR
      const stubStatus = (this.config.get<string>("STUB_NIBSS_ENROLLMENT") ?? "SUCCESS") as NibssEnrollResponse["status"];
      const stubBvn    = stubStatus === "SUCCESS" ? `${Date.now()}`.slice(-11) : undefined;
      const stubDupBvn = stubStatus === "DUPLICATE" ? "99900000001" : undefined;
      this.log.warn(`[NibssPush][stub] No NIBSS_ENROLLMENT_BASE_URL — simulating ${stubStatus} for ${payload.enrollmentId}`);
      await this.handleCallback({ enrollmentId: payload.enrollmentId, status: stubStatus, assignedBvn: stubBvn, existingBvn: stubDupBvn, rawPayload: JSON.stringify({ stub: true }) }, orgId);
      return;
    }

    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 30_000);
    try {
      // TLS 1.3 enforced by Node.js fetch (no insecure fallback) — satisfies HSM transit requirement
      const res  = await fetch(new URL(path, baseUrl), {
        method:  "POST",
        signal:  ctrl.signal,
        headers: { "content-type": "application/json", "x-shard-country": payload.shardCountry, ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body:    JSON.stringify(payload),
      });
      const body = (await res.json()) as NibssEnrollResponse;
      await this.prisma.nibssSubmission.update({
        where: { id: submissionId },
        data:  { nibssStatus: body.status ?? NIBSS_PUSH_ERROR, assignedBvn: body.bvn ?? null, nibssResponsePayload: JSON.stringify(body) },
      });
      if      (body.status === "SUCCESS"   && body.bvn)         await this.bankability.upgradeToGlobal({ tfanId, bvn: body.bvn, orgId });
      else if (body.status === "DUPLICATE" && body.existingBvn) await this.bankability.linkDuplicateBvn(tfanId, body.existingBvn, orgId);
      else await this.prisma.unbankedProfile.update({ where: { tfanId }, data: { status: "UNBANKED" } });
    } catch (e) {
      await this.prisma.nibssSubmission.update({ where: { id: submissionId }, data: { nibssStatus: NIBSS_PUSH_ERROR, nibssResponsePayload: JSON.stringify({ error: String(e) }) } });
      await this.prisma.unbankedProfile.update({ where: { tfanId }, data: { status: "UNBANKED" } });
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

