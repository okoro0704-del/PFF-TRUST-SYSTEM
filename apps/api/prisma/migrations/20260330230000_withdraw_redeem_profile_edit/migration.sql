-- Withdrawal Token Redemption columns
ALTER TABLE "withdrawal_authorization"
    ADD COLUMN "redeemed_at"        TIMESTAMP(3),
    ADD COLUMN "redemption_channel" TEXT;

CREATE INDEX "withdrawal_authorization_status_idx"
    ON "withdrawal_authorization"("status");

