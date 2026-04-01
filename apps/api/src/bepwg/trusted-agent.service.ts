import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * TrustedAgentLinkService — manages the "Trusted Link" between customers and agents.
 *
 * A Trusted Agent is one with whom a customer has at least one recorded savings
 * history. The link enables standard (1-gate) BEPWG withdrawals.
 *
 * Links are created at cycle open and incremented at each successful withdrawal
 * through the same agent.
 */
@Injectable()
export class TrustedAgentService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  private bvnHash(bvn: string): string {
    const pepper = this.config.get<string>("BVN_PEPPER") ?? "dev-pepper-change-me";
    return createHmac("sha256", pepper).update(bvn.normalize("NFKC")).digest("hex");
  }

  /**
   * Create or increment the trusted link between a customer and an agent.
   * Called at: cycle open (first time = cycleCount 1), withdrawal execution.
   */
  async upsertLink(customerBvnHash: string, agentBvnHash: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    const existing = await this.prisma.trustedAgentLink.findUnique({
      where: { customerBvnHash_agentBvnHash_orgId: { customerBvnHash, agentBvnHash, orgId } },
    });
    if (existing) {
      return this.prisma.trustedAgentLink.update({
        where: { id: existing.id },
        data:  { cycleCount: existing.cycleCount + 1 },
      });
    }
    return this.prisma.trustedAgentLink.create({
      data: { customerBvnHash, agentBvnHash, cycleCount: 1, orgId },
    });
  }

  /**
   * Check if an agent is trusted by a customer (history exists).
   * Returns true if at least one savings cycle has been recorded between them.
   */
  async isTrusted(customerBvnHash: string, agentBvnHash: string, orgId: string): Promise<boolean> {
    await this.prisma.setOrgContext(orgId);
    const link = await this.prisma.trustedAgentLink.findUnique({
      where: { customerBvnHash_agentBvnHash_orgId: { customerBvnHash, agentBvnHash, orgId } },
    });
    return !!link;
  }

  /** Manually establish a trusted link (e.g. seeded at cycle open). */
  async linkFromBvns(customerBvn: string, agentBvn: string, orgId: string) {
    const customerHash = this.bvnHash(customerBvn);
    const agentHash    = this.bvnHash(agentBvn);
    return this.upsertLink(customerHash, agentHash, orgId);
  }

  /** Get all trusted agents for a customer (for display in dashboard). */
  async listTrustedAgents(customerBvnHash: string, orgId: string) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.trustedAgentLink.findMany({
      where:   { customerBvnHash, orgId },
      orderBy: { cycleCount: "desc" },
      select:  { agentBvnHash: true, cycleCount: true, firstLinkedAt: true, lastActivityAt: true },
    });
  }
}

