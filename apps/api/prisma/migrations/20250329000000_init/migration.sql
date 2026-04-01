-- CreateTable
CREATE TABLE "tfan" (
    "id" TEXT NOT NULL,
    "bvn_hash" TEXT NOT NULL,
    "fingerprint_packed" BYTEA NOT NULL,
    "face_packed" BYTEA NOT NULL,
    "mobile_packed" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verification_ref" TEXT,

    CONSTRAINT "tfan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tfan_bvn_hash_idx" ON "tfan"("bvn_hash");

CREATE TABLE "verification_ledger" (
    "id" TEXT NOT NULL,
    "external_transaction_id" TEXT NOT NULL,
    "policy_mode" TEXT NOT NULL,
    "amount_minor_units" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "sentinel_threshold_minor" DECIMAL(24,0),
    "fp_outcome" TEXT NOT NULL,
    "face_outcome" TEXT NOT NULL,
    "mobile_outcome" TEXT NOT NULL,
    "aggregate_confirmed" BOOLEAN NOT NULL,
    "mismatch_alert" BOOLEAN NOT NULL DEFAULT false,
    "nibss_meta_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id" TEXT NOT NULL DEFAULT 'default',

    CONSTRAINT "verification_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_ledger_created_at_idx" ON "verification_ledger"("created_at");
CREATE INDEX "verification_ledger_org_id_created_at_idx" ON "verification_ledger"("org_id", "created_at");

CREATE TABLE "liquidity_snapshot" (
    "id" TEXT NOT NULL,
    "partner_bank" TEXT NOT NULL,
    "account_ref" TEXT NOT NULL,
    "balance_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidity_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liquidity_snapshot_partner_bank_captured_at_idx" ON "liquidity_snapshot"("partner_bank", "captured_at");

-- Row-Level Security: org-scoped app role (CRDB/PostgreSQL)
ALTER TABLE "verification_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tfan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "liquidity_snapshot" ENABLE ROW LEVEL SECURITY;

CREATE POLICY verification_ledger_org_isolation ON "verification_ledger"
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id', true));

CREATE POLICY verification_ledger_insert ON "verification_ledger"
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

CREATE POLICY tfan_org_isolation ON "tfan"
  FOR ALL
  USING (true);

-- TFAN: tighten with org column in future; placeholder policy for RLS enabled

CREATE POLICY liquidity_read ON "liquidity_snapshot"
  FOR SELECT
  USING (true);
