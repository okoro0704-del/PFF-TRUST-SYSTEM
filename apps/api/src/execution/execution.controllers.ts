import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AccountExecutionService } from "./account-execution.service";
import { TransferExecutionService } from "./transfer-execution.service";
import { WithdrawExecutionService } from "./withdraw-execution.service";
import { BillsExecutionService } from "./bills-execution.service";
import { BiometricExecutionService } from "./biometric-execution.service";
import { AccountCreateDto } from "./dto/account-create.dto";
import { TransferExecuteDto } from "./dto/transfer-execute.dto";
import { WithdrawAuthorizeDto } from "./dto/withdraw-authorize.dto";
import { WithdrawRedeemDto } from "./dto/withdraw-redeem.dto";
import { BillsPayDto } from "./dto/bills-pay.dto";
import { MintProofDto } from "./dto/mint-proof.dto";

@ApiTags("execution")
@Controller("account")
export class AccountExecutionController {
  constructor(private readonly accounts: AccountExecutionService) {}

  @ApiOperation({ summary: "Provision a new Tier-1 ledger account for a bankable identity" })
  @Post("create")
  create(@Body() dto: AccountCreateDto) {
    return this.accounts.createAccount(dto);
  }
}

@ApiTags("execution")
@Controller("transfer")
export class TransferExecutionController {
  constructor(private readonly transfers: TransferExecutionService) {}

  @ApiOperation({ summary: "Biometric-gated account-to-account transfer (CBS direct debit)" })
  @Post("execute")
  execute(@Body() dto: TransferExecuteDto) {
    return this.transfers.execute(dto);
  }
}

@ApiTags("execution")
@Controller("withdraw")
export class WithdrawExecutionController {
  constructor(private readonly withdraws: WithdrawExecutionService) {}

  @ApiOperation({ summary: "Authorize withdrawal — mint a 15-min ACTIVE payout token after biometric gate" })
  @Post("authorize")
  authorize(@Body() dto: WithdrawAuthorizeDto) {
    return this.withdraws.authorize(dto);
  }

  @ApiOperation({ summary: "Redeem withdrawal token — atomically debit account and mark token REDEEMED (TOCTOU-safe)" })
  @Post("redeem")
  redeem(@Body() dto: WithdrawRedeemDto) {
    return this.withdraws.redeemToken(dto);
  }
}

@ApiTags("execution")
@Controller("bills")
export class BillsExecutionController {
  constructor(private readonly bills: BillsExecutionService) {}

  @ApiOperation({ summary: "VCAP bill payment — biometric-gated utility / airtime settlement" })
  @Post("pay")
  pay(@Body() dto: BillsPayDto) {
    return this.bills.pay(dto);
  }
}

@ApiTags("execution")
@Controller("execution")
export class ExecutionProofController {
  constructor(private readonly biometric: BiometricExecutionService) {}

  @ApiOperation({ summary: "Mint HMAC validation hash — 90s stateless biometric proof for downstream requests" })
  @Post("mint-validation-hash")
  mintProof(@Body() dto: MintProofDto) {
    return this.biometric.mintValidationHash({
      accountPublicRef: dto.accountPublicRef,
      bvn: dto.bvn,
      online: dto.online,
      biometrics: dto.biometrics,
    });
  }
}
