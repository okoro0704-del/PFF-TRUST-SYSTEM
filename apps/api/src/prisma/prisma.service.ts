import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** RLS: set org for current DB session (call before scoped queries). */
  async setOrgContext(orgId: string) {
    await this.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, false)`;
  }
}
