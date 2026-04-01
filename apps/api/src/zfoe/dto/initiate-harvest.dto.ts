import { IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Step 1 — One-Touch MSISDN input.
 * The server looks up the BVN-linked MSISDN against the NIBSS national identity mirror
 * and returns an encrypted Shadow Profile preview (name, DOB, address — partial, no BVN).
 */
export class InitiateHarvestDto {
  @ApiProperty({
    description: "BVN-linked mobile number in E.164 format",
    example: "+2348012345678",
  })
  @IsString()
  @Matches(/^\+[1-9][0-9]{7,14}$/, { message: "msisdn must be in E.164 format (e.g. +2348012345678)" })
  msisdn!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

