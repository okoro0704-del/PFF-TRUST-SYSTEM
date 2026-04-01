import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  SMS_ACCOUNT_CREATED, SMS_DELIVERED, SMS_FAILED,
  SMS_SENT, SMS_STUB, SMS_TERMII,
  TERMII_BASE_URL, TERMII_CHANNEL, TERMII_MSG_TYPE, TERMII_SMS_ENDPOINT,
} from "./zfps.constants";

interface TermiiResponse { code: string; message_id: string; message: string; balance: number; user: string; }

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `***${digits.slice(-4)}`;
}

/**
 * SmsNotificationService — Termii API integration with stub fallback.
 *
 * Production mode: TERMII_API_KEY + TERMII_SENDER_ID set in env.
 *   → POST to https://api.ng.termii.com/api/sms/send
 *   → Logs SmsSendLog record with providerMsgId
 *
 * Stub mode: TERMII_API_KEY not set.
 *   → Logs SmsSendLog with provider = "STUB", status = "SENT"
 *   → Message body printed to logger (dev convenience)
 */
@Injectable()
export class SmsNotificationService {
  private readonly log = new Logger(SmsNotificationService.name);

  constructor(
    private readonly config:  ConfigService,
    private readonly prisma:  PrismaService,
  ) {}

  /**
   * Send account-created SMS after CBS returns the NUBAN.
   *
   * @param phone      Raw phone number (will be masked in all DB logs)
   * @param accountNumber  Full NUBAN account number (sent to customer, never stored in DB)
   * @param bankName   Bank display name
   * @param accountType  "SAVINGS" | "CURRENT"
   * @param sessionRef  For audit correlation
   * @param orgId
   */
  async sendAccountCreated(
    phone: string, accountNumber: string, bankName: string,
    accountType: string, sessionRef: string, orgId = "default",
  ): Promise<{ sent: boolean; provider: string; messageId?: string }> {
    const message = [
      `🏦 F-Man Account Alert`,
      `Your new ${accountType} account at ${bankName} is LIVE.`,
      `Account No: ${accountNumber}`,
      `✓ Verified by NIBSS biometrics — Zero-input onboarding.`,
      `Powered by F-Man Technologies`,
    ].join("\n");

    const apiKey    = this.config.get<string>("TERMII_API_KEY");
    const senderId  = this.config.get<string>("TERMII_SENDER_ID") ?? "F-ManNG";
    const masked    = maskPhone(phone);

    if (!apiKey) {
      this.log.log(`[SMS][STUB] → ${masked} | ${message.split("\n")[1]}`);
      await this.writeSmsLog({ masked, sessionRef, message, provider: SMS_STUB, status: SMS_SENT, orgId });
      return { sent: true, provider: SMS_STUB };
    }

    try {
      const body = {
        to:       phone,
        from:     senderId,
        sms:      message,
        type:     TERMII_MSG_TYPE,
        channel:  TERMII_CHANNEL,
        api_key:  apiKey,
      };

      const res  = await fetch(`${TERMII_BASE_URL}${TERMII_SMS_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as TermiiResponse;

      const success = res.ok && data.code === "ok";
      await this.writeSmsLog({
        masked, sessionRef, message, provider: SMS_TERMII,
        status: success ? SMS_DELIVERED : SMS_FAILED,
        providerMsgId: data.message_id,
        orgId,
      });

      if (!success) this.log.warn(`[SMS][Termii] Delivery failed: ${data.message}`);
      return { sent: success, provider: SMS_TERMII, messageId: data.message_id };

    } catch (err) {
      this.log.error(`[SMS][Termii] Request error: ${String(err)}`);
      await this.writeSmsLog({ masked, sessionRef, message, provider: SMS_TERMII, status: SMS_FAILED, orgId });
      return { sent: false, provider: SMS_TERMII };
    }
  }

  private async writeSmsLog(p: {
    masked: string; sessionRef: string; message: string;
    provider: string; status: string; providerMsgId?: string; orgId: string;
  }) {
    try {
      await this.prisma.setOrgContext(p.orgId);
      await this.prisma.smsSendLog.create({
        data: {
          recipient: p.masked, messageType: SMS_ACCOUNT_CREATED,
          sessionRef: p.sessionRef, provider: p.provider,
          messageBody: p.message, providerMsgId: p.providerMsgId ?? null,
          status: p.status, sentAt: new Date(), orgId: p.orgId,
        },
      });
    } catch (err) {
      this.log.warn(`[SMS] Failed to write SMS log: ${String(err)}`);
    }
  }

  async getRecentLogs(orgId = "default", limit = 20) {
    await this.prisma.setOrgContext(orgId);
    return this.prisma.smsSendLog.findMany({
      where: { messageType: SMS_ACCOUNT_CREATED },
      orderBy: { createdAt: "desc" }, take: limit,
    });
  }
}

