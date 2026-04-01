import { IsOptional, IsString } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 0 — Prime a BLS-TSA session.
 *
 * Returns { sessionRef, sessionToken, idleExpiresAt }.
 * The client must pass sessionToken on every subsequent call for stateless validation.
 * The 60-second idle timer starts immediately — inactivity past this window expires the session.
 */
export class InitiateDiscoveryDto {
  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

