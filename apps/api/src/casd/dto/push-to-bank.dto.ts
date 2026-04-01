import { ArrayMinSize, IsArray, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Admin DTO — manually push sovereign documents to an approved bank.
 *
 * When no documentIds are specified, ALL active sovereign documents are pushed.
 * An automatic push is triggered when a bank reaches APPROVED status.
 * Each push creates a BankDocPush record with deliveryStatus = SENT.
 */
export class PushToBankDto {
  @ApiProperty({
    description:
      "IDs of sovereign documents to push. Leave empty to push ALL active documents. " +
      "Duplicate IDs are deduplicated server-side.",
    type: [String],
    required: false,
    example: ["clxyz123", "clxyz456"],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

