import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  TOLL_BILL_PAYMENT, TOLL_NIBSS_YES, TOLL_TRANSFER, TOLL_WITHDRAWAL,
  SESSION_BIH, SESSION_BLIDE, SESSION_BLS,
} from "../rscc.constants";

export enum TollTypeFilter {
  ALL          = "ALL",
  NIBSS_YES    = TOLL_NIBSS_YES,
  TRANSFER     = TOLL_TRANSFER,
  BILL_PAYMENT = TOLL_BILL_PAYMENT,
  WITHDRAWAL   = TOLL_WITHDRAWAL,
}

export enum SessionTypeFilter {
  ALL   = "ALL",
  BIH   = SESSION_BIH,
  BLIDE = SESSION_BLIDE,
  BLS   = SESSION_BLS,
}

/**
 * Query filter for the Switching Ledger.
 * All fields optional — omitting returns unfiltered paginated results.
 */
export class SwitchingFilterDto {
  @ApiPropertyOptional({ enum: TollTypeFilter, example: TollTypeFilter.NIBSS_YES })
  @IsOptional()
  @IsEnum(TollTypeFilter)
  tollType?: TollTypeFilter;

  @ApiPropertyOptional({ enum: SessionTypeFilter, example: SessionTypeFilter.BLS })
  @IsOptional()
  @IsEnum(SessionTypeFilter)
  sessionType?: SessionTypeFilter;

  @ApiPropertyOptional({ description: "CBN bank sort code filter", example: "058063220" })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiPropertyOptional({ description: "Nigerian state — implements 10m-Rule geo-filter", example: "Lagos" })
  @IsOptional()
  @IsString()
  agentState?: string;

  @ApiPropertyOptional({ description: "LGA sub-filter", example: "Ikeja" })
  @IsOptional()
  @IsString()
  agentLga?: string;

  @ApiPropertyOptional({ description: "1-based page number", example: 1, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

