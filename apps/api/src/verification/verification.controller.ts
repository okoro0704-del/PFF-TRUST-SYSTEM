import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { VerificationService } from "./verification.service";
import { TripleGateEnrollDto } from "./dto/enroll.dto";
import { TransactionConfirmDto } from "./dto/confirm.dto";

@ApiTags("identity")
@Controller("v1/identity")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @ApiOperation({ summary: "Triple-Gate biometric enrollment (fingerprint + face + mobile)" })
  @Post("enroll")
  enroll(@Body() dto: TripleGateEnrollDto) {
    return this.verification.enrollTripleGate(dto);
  }

  @ApiOperation({ summary: "Confirm transaction via Triple-Gate + Second Watch dual-validation" })
  @Post("confirm-transaction")
  confirm(@Body() dto: TransactionConfirmDto) {
    return this.verification.confirmTransaction(dto);
  }
}
