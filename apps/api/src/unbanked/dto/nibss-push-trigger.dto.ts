import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

/** Trigger the National Push pipeline for an enrolled unbanked user. */
export class NibssPushTriggerDto {
  /** TFAN assigned at enrollment — primary key while BVN is pending. */
  @IsString()
  @IsNotEmpty()
  tfanId!: string;

  @IsOptional()
  @IsString()
  orgId?: string;

  /** Override the shard country for the push (defaults to the profile's shardCountry). */
  @IsOptional()
  @IsIn(["NG", "GH"])
  shardCountry?: "NG" | "GH";
}

