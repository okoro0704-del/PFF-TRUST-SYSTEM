-- Three-string model for non-BVN: single AES-GCM blob for all 10 fingerprint templates (JSON inside ciphertext)
ALTER TABLE "internal_biometric_subject" ADD COLUMN IF NOT EXISTS "fingerprints_bundle_packed" BYTEA;

-- Row-Level Security (Sovereign Data Act — org isolation)
ALTER TABLE "ledger_account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ledger_transfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "withdrawal_authorization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bill_payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pulse_sync_queue" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_account_org_isolation ON "ledger_account"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

CREATE POLICY ledger_transfer_org_isolation ON "ledger_transfer"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

CREATE POLICY withdrawal_org_isolation ON "withdrawal_authorization"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

CREATE POLICY bill_payment_org_isolation ON "bill_payment"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

CREATE POLICY pulse_sync_shard ON "pulse_sync_queue"
  FOR ALL
  USING (true);
