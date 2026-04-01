import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Matches } from "class-validator";

export class UnlockTerminalDto {
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @IsOptional()
  @IsString()
  fingerprintTemplateB64?: string;

  @IsOptional()
  @IsString()
  faceTemplateB64?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  mobileNumber?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  orgId?: string;
}
