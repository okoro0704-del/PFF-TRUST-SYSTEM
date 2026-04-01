import { IsIn, IsOptional, IsString, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Register an external FAP-20 biometric sensor.
 * Supported models: Dermalog LF10, SecuGen Hamster Pro, Aratek A600, Generic FAP-20.
 * Registered sensors are tied to an agent and can be used for fingerprint submission
 * without relying on the mobile device's built-in sensor.
 */
export class RegisterSensorDto {
  @ApiProperty({
    description: "Hardware serial number of the FAP-20 device (unique identifier)",
    example: "DRM-LF10-8A3F2B91",
  })
  @IsString()
  deviceId!: string;

  @ApiProperty({
    enum: ["DERMALOG_LF10", "SECUGEN_HAMSTER", "ARATEK_A600", "GENERIC_FAP20"],
    description: "Certified sensor model",
    example: "DERMALOG_LF10",
  })
  @IsIn(["DERMALOG_LF10", "SECUGEN_HAMSTER", "ARATEK_A600", "GENERIC_FAP20"])
  sensorModel!: string;

  @ApiProperty({ enum: ["USB", "BLUETOOTH"], example: "USB" })
  @IsIn(["USB", "BLUETOOTH"])
  sensorProtocol!: string;

  @ApiProperty({ description: "BVN of the agent binding this sensor", example: "98765432109" })
  @IsString()
  @Matches(/^[0-9]{11}$/)
  agentBvn!: string;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

