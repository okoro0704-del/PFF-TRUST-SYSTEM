import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class BindTerminalDto {
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  /** Agent BVN — must already be enrolled (TFAN exists). */
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @IsOptional()
  @IsString()
  orgId?: string;
}
