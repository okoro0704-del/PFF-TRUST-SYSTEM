import { IsOptional, IsString, Matches } from "class-validator";

export class BiometricInlineDto {
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
}
