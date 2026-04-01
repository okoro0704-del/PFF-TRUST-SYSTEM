import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface AuditLogEntry {
  eventType:       string;
  sessionRef:      string;
  customerBvnHash?: string;
  agentBvnHash?:   string;
  orgId:           string;
  metadata?:       Record<string, unknown>;
}

/**
 * LbasAuditService — append-only audit logger for all LBAS events.
 *
 * Every liveness task, sensor submission, and networkless challenge step is logged
 * with structured metadata. Raw biometric templates are NEVER written to this log.
 *
 * GET /v1/admin/lbas/audit — admin retrieval with pagination.
 */
@Injectable()
export class LbasAuditService {
  private readonly logger = new Logger(LbasAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.lbasAuditLog.create({
        data: {
          eventType:       entry.eventType,
          sessionRef:      entry.sessionRef,
          customerBvnHash: entry.customerBvnHash ?? null,
          agentBvnHash:    entry.agentBvnHash ?? null,
          metadataJson:    entry.metadata ? JSON.stringify(entry.metadata) : null,
          orgId:           entry.orgId,
        },
      });
    } catch (err) {
      // Audit failure must never break the main flow
      this.logger.error(`[LBAS][audit] Failed to write log for ${entry.eventType}: ${String(err)}`);
    }
  }

  /** Retrieve the audit trail for a specific session reference (liveness token or networkless ref). */
  async getSessionAudit(sessionRef: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.lbasAuditLog.findMany({
      where:   { sessionRef, orgId },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Retrieve paginated LBAS audit log for admin — optionally filtered by eventType. */
  async getAuditLog(orgId: string, take = 100, eventType?: string) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.lbasAuditLog.findMany({
      where:   { orgId, ...(eventType ? { eventType } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}

