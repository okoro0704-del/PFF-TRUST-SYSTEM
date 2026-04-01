import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ok() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", service: "bsss-api", database: "up", timestamp: new Date().toISOString() };
    } catch {
      return { status: "degraded", service: "bsss-api", database: "down", timestamp: new Date().toISOString() };
    }
  }
}
