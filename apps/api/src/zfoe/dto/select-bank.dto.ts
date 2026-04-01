import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum AccountType { SAVINGS = "SAVINGS", CURRENT = "CURRENT" }

/**
 * Step 2 — Customer selects a bank from the National Bank Grid and chooses account type.
 * Returns confirmation of selection; advances session → BANK_SELECTED.
 */
export class SelectBankDto {
  @ApiProperty({
    description: "CBN/BoG bank sort code from the National Bank Directory",
    example: "011151012",
  })
  @IsString()
  @Length(6, 12)
  bankCode!: string;

  @ApiProperty({ enum: AccountType, description: "Type of account to create", example: AccountType.SAVINGS })
  @IsEnum(AccountType)
  accountType!: AccountType;

  @ApiPropertyOptional({ example: "default" })
  @IsOptional()
  @IsString()
  orgId?: string;
}

