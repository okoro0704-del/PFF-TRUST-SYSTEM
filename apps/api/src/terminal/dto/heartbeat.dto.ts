import { IsOptional, IsString } from "class-validator";

export class TerminalHeartbeatDto {
  @IsOptional()
  @IsString()
  orgId?: string;
}
