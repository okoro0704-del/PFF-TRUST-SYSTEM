-- ============================================================
-- PFF-TRUST SYSTEM � Full Schema Migration
-- Run this in: Supabase Dashboard ? SQL Editor
-- Project: xbpomcmkzwunozrsbqxf
-- ============================================================

-- Create Prisma migrations tracking table
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36)  NOT NULL,
    "checksum"              VARCHAR(64)  NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count"   INTEGER      NOT NULL DEFAULT 0,
    PRIMARY KEY ("id")
);

-- Mark all migrations as applied
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES
  ('01-init',    'baseline', NOW(), '20250329000000_init',                              1),
  ('02-pos',     'baseline', NOW(), '20260330120000_pos_terminal_tcp',                  1),
  ('03-exec',    'baseline', NOW(), '20260330140000_execution_layer',                   1),
  ('04-rls',     'baseline', NOW(), '20260330160000_internal_fp_bundle_rls',            1),
  ('05-unbanked','baseline', NOW(), '20260330200000_unbanked_nibss',                    1),
  ('06-watch',   'baseline', NOW(), '20260330220000_watch_eye_supplemental',            1),
  ('07-withdraw','baseline', NOW(), '20260330230000_withdraw_redeem_profile_edit',      1),
  ('08-bvn',     'baseline', NOW(), '20260330240000_bvn_hash_rate_limit',               1),
  ('09-lliw',    'baseline', NOW(), '20260330250000_lliw_savings_gate',                 1),
  ('10-bepwg',   'baseline', NOW(), '20260330260000_bepwg',                             1),
  ('11-lbas',    'baseline', NOW(), '20260330270000_lbas',                              1),
  ('12-unwp',    'baseline', NOW(), '20260330280000_unwp',                              1),
  ('13-zfoe',    'baseline', NOW(), '20260330290000_zfoe',                              1),
  ('14-bih',     'baseline', NOW(), '20260330300000_bih',                               1),
  ('15-bls',     'baseline', NOW(), '20260330310000_bls',                               1),
  ('16-blide',   'baseline', NOW(), '20260330320000_blide',                             1),
  ('17-casd',    'baseline', NOW(), '20260330330000_casd',                              1),
  ('18-rscc',    'baseline', NOW(), '20260330340000_rscc',                              1),
  ('19-zfps',    'baseline', NOW(), '20260330350000_zfps',                              1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SCHEMA TABLES BELOW
-- ============================================================
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
CREATE TABLE "pos_terminal" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "agent_bvn_hash" TEXT NOT NULL,
    "lock_state" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "consecutive_failed_unlocks" INTEGER NOT NULL DEFAULT 0,
    "last_daily_lock_at" TIMESTAMP(3),
    "stealth_capture_at" TIMESTAMP(3),
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_terminal_terminal_id_key" ON "pos_terminal"("terminal_id");
CREATE INDEX "pos_terminal_org_id_idx" ON "pos_terminal"("org_id");
CREATE INDEX "pos_terminal_agent_bvn_hash_idx" ON "pos_terminal"("agent_bvn_hash");

CREATE TABLE "terminal_tcp_ledger" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "event_type" TEXT NOT NULL,
    "payload_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_tcp_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_tcp_ledger_terminal_id_created_at_idx" ON "terminal_tcp_ledger"("terminal_id", "created_at");
CREATE INDEX "terminal_tcp_ledger_org_id_created_at_idx" ON "terminal_tcp_ledger"("org_id", "created_at");

ALTER TABLE "terminal_tcp_ledger" ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_tcp_ledger_org_select ON "terminal_tcp_ledger"
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id', true));

CREATE POLICY terminal_tcp_ledger_org_insert ON "terminal_tcp_ledger"
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id', true));
CREATE TABLE "internal_biometric_subject" (
    "id" TEXT NOT NULL,
    "public_subject_id" TEXT NOT NULL,
    "face_packed" BYTEA NOT NULL,
    "mobile_packed" BYTEA NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_biometric_subject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_biometric_subject_public_subject_id_key" ON "internal_biometric_subject"("public_subject_id");
CREATE INDEX "internal_biometric_subject_shard_region_idx" ON "internal_biometric_subject"("shard_region");

CREATE TABLE "internal_fingerprint_slot" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "fingerprint_packed" BYTEA NOT NULL,

    CONSTRAINT "internal_fingerprint_slot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_fingerprint_slot_subject_id_slot_index_key" ON "internal_fingerprint_slot"("subject_id", "slot_index");
CREATE INDEX "internal_fingerprint_slot_subject_id_idx" ON "internal_fingerprint_slot"("subject_id");

ALTER TABLE "internal_fingerprint_slot" ADD CONSTRAINT "internal_fingerprint_slot_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "internal_biometric_subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ledger_account" (
    "id" TEXT NOT NULL,
    "public_ref" TEXT NOT NULL,
    "owner_bvn_hash" TEXT,
    "owner_internal_subject_id" TEXT,
    "currency_code" TEXT NOT NULL,
    "balance_minor" DECIMAL(24,0) NOT NULL DEFAULT 0,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_account_public_ref_key" ON "ledger_account"("public_ref");
CREATE INDEX "ledger_account_owner_bvn_hash_idx" ON "ledger_account"("owner_bvn_hash");
CREATE INDEX "ledger_account_owner_internal_subject_id_idx" ON "ledger_account"("owner_internal_subject_id");
CREATE INDEX "ledger_account_shard_region_idx" ON "ledger_account"("shard_region");

ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_owner_internal_subject_id_fkey" FOREIGN KEY ("owner_internal_subject_id") REFERENCES "internal_biometric_subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ledger_transfer" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "narrative" TEXT,
    "biometric_audit_json" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_transfer_idempotency_key_key" ON "ledger_transfer"("idempotency_key");
CREATE INDEX "ledger_transfer_debit_account_id_idx" ON "ledger_transfer"("debit_account_id");
CREATE INDEX "ledger_transfer_created_at_idx" ON "ledger_transfer"("created_at");

ALTER TABLE "ledger_transfer" ADD CONSTRAINT "ledger_transfer_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_transfer" ADD CONSTRAINT "ledger_transfer_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "withdrawal_authorization" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "biometric_audit_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_authorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_authorization_token_key" ON "withdrawal_authorization"("token");
CREATE INDEX "withdrawal_authorization_account_id_idx" ON "withdrawal_authorization"("account_id");

ALTER TABLE "withdrawal_authorization" ADD CONSTRAINT "withdrawal_authorization_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bill_payment" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "vcap_reference" TEXT NOT NULL,
    "utility_code" TEXT NOT NULL,
    "biometric_audit_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bill_payment_idempotency_key_key" ON "bill_payment"("idempotency_key");
CREATE INDEX "bill_payment_account_id_idx" ON "bill_payment"("account_id");

ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pulse_sync_queue" (
    "id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "pulse_sync_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pulse_sync_queue_status_idx" ON "pulse_sync_queue"("status");
CREATE INDEX "pulse_sync_queue_reference_idx" ON "pulse_sync_queue"("reference_type", "reference_id");
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
-- Unbanked Capture Repository + National Push audit trail
-- Sections: unbanked_profile, nibss_submission, RLS, FK constraints

CREATE TABLE "unbanked_profile" (
    "id"                   TEXT NOT NULL,
    "tfan_id"              TEXT NOT NULL,
    "internal_subject_id"  TEXT NOT NULL,
    "first_name"           TEXT NOT NULL,
    "last_name"            TEXT NOT NULL,
    "middle_name"          TEXT,
    "date_of_birth"        TIMESTAMP(3) NOT NULL,
    "gender"               TEXT NOT NULL,
    "address"              TEXT NOT NULL,
    "state_of_origin"      TEXT NOT NULL,
    "shard_country"        TEXT NOT NULL DEFAULT 'NG',
    "status"               TEXT NOT NULL DEFAULT 'UNBANKED',
    "bvn_hash"             TEXT,
    "nibss_enrollment_id"  TEXT,
    "org_id"               TEXT NOT NULL DEFAULT 'default',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unbanked_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unbanked_profile_tfan_id_key"             ON "unbanked_profile"("tfan_id");
CREATE UNIQUE INDEX "unbanked_profile_internal_subject_id_key" ON "unbanked_profile"("internal_subject_id");
CREATE INDEX        "unbanked_profile_bvn_hash_idx"            ON "unbanked_profile"("bvn_hash");
CREATE INDEX        "unbanked_profile_status_org_id_idx"       ON "unbanked_profile"("status", "org_id");
CREATE INDEX        "unbanked_profile_org_id_created_at_idx"   ON "unbanked_profile"("org_id", "created_at");

ALTER TABLE "unbanked_profile"
    ADD CONSTRAINT "unbanked_profile_internal_subject_id_fkey"
    FOREIGN KEY ("internal_subject_id")
    REFERENCES "internal_biometric_subject"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "nibss_submission" (
    "id"                     TEXT NOT NULL,
    "profile_id"             TEXT NOT NULL,
    "enrollment_id"          TEXT NOT NULL,
    "submission_timestamp"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nibss_response_payload" TEXT,
    "nibss_status"           TEXT NOT NULL,
    "assigned_bvn"           TEXT,
    "shard_country"          TEXT NOT NULL DEFAULT 'NG',
    "org_id"                 TEXT NOT NULL DEFAULT 'default',
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nibss_submission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nibss_submission_enrollment_id_key"      ON "nibss_submission"("enrollment_id");
CREATE INDEX        "nibss_submission_profile_id_idx"         ON "nibss_submission"("profile_id");
CREATE INDEX        "nibss_submission_nibss_status_idx"       ON "nibss_submission"("nibss_status");
CREATE INDEX        "nibss_submission_org_id_created_at_idx"  ON "nibss_submission"("org_id", "created_at");

ALTER TABLE "nibss_submission"
    ADD CONSTRAINT "nibss_submission_profile_id_fkey"
    FOREIGN KEY ("profile_id")
    REFERENCES "unbanked_profile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security (Sovereign Data Act — org isolation)
ALTER TABLE "unbanked_profile"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nibss_submission"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY unbanked_profile_org_isolation ON "unbanked_profile"
  FOR ALL
  USING  (org_id = current_setting('app.current_org_id', true))
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

-- nibss_submission: INSERT-only for the app role (append-only audit — FR-07 pattern)
CREATE POLICY nibss_submission_org_select ON "nibss_submission"
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id', true));

CREATE POLICY nibss_submission_org_insert ON "nibss_submission"
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id', true));

-- UPDATE allowed only for status/response fields (PENDING → final state)
CREATE POLICY nibss_submission_org_update ON "nibss_submission"
  FOR UPDATE
  USING (org_id = current_setting('app.current_org_id', true));

-- Watch Eye Supplemental Log — immutable append-only biometric mirror entries
-- Each NIBSS YES beyond initial enrollment is captured here (never overwrites TfanRecord).

CREATE TABLE "watch_eye_supplemental_log" (
    "id"             TEXT NOT NULL,
    "bvn_hash"       TEXT NOT NULL,
    "gate"           TEXT NOT NULL,
    "packed_blob"    BYTEA NOT NULL,
    "correlation_id" TEXT,
    "org_id"         TEXT NOT NULL DEFAULT 'default',
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_eye_supplemental_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "watch_eye_supplemental_log_bvn_hash_gate_idx"
    ON "watch_eye_supplemental_log"("bvn_hash", "gate");

CREATE INDEX "watch_eye_supplemental_log_bvn_hash_created_at_idx"
    ON "watch_eye_supplemental_log"("bvn_hash", "created_at");

CREATE INDEX "watch_eye_supplemental_log_org_id_created_at_idx"
    ON "watch_eye_supplemental_log"("org_id", "created_at");

-- Row-Level Security (org isolation)
ALTER TABLE "watch_eye_supplemental_log" ENABLE ROW LEVEL SECURITY;

-- INSERT-only for the app role — entries are immutable once written (Watch Eye integrity)
CREATE POLICY watch_eye_supplemental_select ON "watch_eye_supplemental_log"
    FOR SELECT
    USING (org_id = current_setting('app.current_org_id', true));

CREATE POLICY watch_eye_supplemental_insert ON "watch_eye_supplemental_log"
    FOR INSERT
    WITH CHECK (org_id = current_setting('app.current_org_id', true));

-- REVOKE UPDATE, DELETE ON watch_eye_supplemental_log FROM bsss_app; -- run as superuser

-- Withdrawal Token Redemption columns
ALTER TABLE "withdrawal_authorization"
    ADD COLUMN "redeemed_at"        TIMESTAMP(3),
    ADD COLUMN "redemption_channel" TEXT;

CREATE INDEX "withdrawal_authorization_status_idx"
    ON "withdrawal_authorization"("status");

-- Migration: add bvn_hash to verification_ledger for consecutive-failure rate limiting
-- This column is nullable so all existing rows are unaffected.

ALTER TABLE "verification_ledger"
  ADD COLUMN IF NOT EXISTS "bvn_hash" TEXT;

-- Composite index: look up the last N ledger rows for a given BVN hash efficiently
CREATE INDEX IF NOT EXISTS "verification_ledger_bvn_hash_created_at_idx"
  ON "verification_ledger" ("bvn_hash", "created_at");

-- LLIW: Liquidity-Linked Incentive & Withdrawal Gate
-- Four new tables: savings_cycle, daily_deposit_log, agent_incentive_log, emergency_break_log

CREATE TABLE "savings_cycle" (
    "id"                    TEXT        NOT NULL,
    "cycle_ref"             TEXT        NOT NULL,
    "customer_bvn_hash"     TEXT        NOT NULL,
    "agent_bvn_hash"        TEXT        NOT NULL,
    "day1_total_fee_minor"  DECIMAL(24,0) NOT NULL,
    "agent_liquidity_minor" DECIMAL(24,0) NOT NULL,
    "daily_deposit_minor"   DECIMAL(24,0) NOT NULL,
    "total_saved_minor"     DECIMAL(24,0) NOT NULL DEFAULT 0,
    "days_saved"            INTEGER     NOT NULL DEFAULT 0,
    "currency_code"         TEXT        NOT NULL,
    "partner_bank"          TEXT        NOT NULL,
    "status"                TEXT        NOT NULL,
    "withdrawal_gate_status" TEXT       NOT NULL DEFAULT 'LOCKED',
    "start_date"            TIMESTAMP(3) NOT NULL,
    "maturity_unlocked_at"  TIMESTAMP(3),
    "withdrawn_at"          TIMESTAMP(3),
    "penalty_event_id"      TEXT,
    "penalty_minor"         DECIMAL(24,0),
    "net_payout_minor"      DECIMAL(24,0),
    "org_id"                TEXT        NOT NULL DEFAULT 'default',
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "savings_cycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "savings_cycle_cycle_ref_key" ON "savings_cycle"("cycle_ref");
CREATE INDEX "savings_cycle_customer_bvn_hash_idx" ON "savings_cycle"("customer_bvn_hash");
CREATE INDEX "savings_cycle_agent_bvn_hash_idx"    ON "savings_cycle"("agent_bvn_hash");
CREATE INDEX "savings_cycle_org_id_status_idx"     ON "savings_cycle"("org_id", "status");
CREATE INDEX "savings_cycle_status_days_saved_idx" ON "savings_cycle"("status", "days_saved");

CREATE TABLE "daily_deposit_log" (
    "id"                        TEXT        NOT NULL,
    "cycle_id"                  TEXT        NOT NULL,
    "day_number"                INTEGER     NOT NULL,
    "amount_minor"              DECIMAL(24,0) NOT NULL,
    "biometric_validation_hash" TEXT,
    "deposited_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id"                    TEXT        NOT NULL DEFAULT 'default',
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_deposit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_deposit_log_cycle_id_fkey" FOREIGN KEY ("cycle_id")
        REFERENCES "savings_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "daily_deposit_log_cycle_id_day_number_key" ON "daily_deposit_log"("cycle_id","day_number");
CREATE INDEX "daily_deposit_log_cycle_id_deposited_at_idx" ON "daily_deposit_log"("cycle_id","deposited_at");

CREATE TABLE "agent_incentive_log" (
    "id"                     TEXT        NOT NULL,
    "cycle_id"               TEXT        NOT NULL,
    "deposit_id"             TEXT        NOT NULL,
    "day_number"             INTEGER     NOT NULL,
    "incentive_amount_minor" DECIMAL(24,0) NOT NULL,
    "agent_bvn_hash"         TEXT        NOT NULL,
    "partner_bank"           TEXT        NOT NULL,
    "status"                 TEXT        NOT NULL DEFAULT 'PENDING',
    "settled_at"             TIMESTAMP(3),
    "org_id"                 TEXT        NOT NULL DEFAULT 'default',
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_incentive_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_incentive_log_cycle_id_fkey"   FOREIGN KEY ("cycle_id")
        REFERENCES "savings_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_incentive_log_deposit_id_fkey" FOREIGN KEY ("deposit_id")
        REFERENCES "daily_deposit_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_incentive_log_deposit_id_key" ON "agent_incentive_log"("deposit_id");
CREATE INDEX "agent_incentive_log_agent_bvn_hash_created_at_idx" ON "agent_incentive_log"("agent_bvn_hash","created_at");
CREATE INDEX "agent_incentive_log_cycle_id_idx" ON "agent_incentive_log"("cycle_id");
CREATE INDEX "agent_incentive_log_status_idx"   ON "agent_incentive_log"("status");

CREATE TABLE "emergency_break_log" (
    "id"               TEXT        NOT NULL,
    "penalty_event_id" TEXT        NOT NULL,
    "cycle_id"         TEXT        NOT NULL,
    "customer_bvn_hash" TEXT       NOT NULL,
    "agent_bvn_hash"   TEXT        NOT NULL,
    "total_saved_minor" DECIMAL(24,0) NOT NULL,
    "penalty_minor"    DECIMAL(24,0) NOT NULL,
    "net_payout_minor" DECIMAL(24,0) NOT NULL,
    "days_broken_at"   INTEGER     NOT NULL,
    "org_id"           TEXT        NOT NULL DEFAULT 'default',
    "broken_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emergency_break_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "emergency_break_log_penalty_event_id_key" ON "emergency_break_log"("penalty_event_id");
CREATE UNIQUE INDEX "emergency_break_log_cycle_id_key"          ON "emergency_break_log"("cycle_id");
CREATE INDEX "emergency_break_log_customer_bvn_hash_idx"        ON "emergency_break_log"("customer_bvn_hash");
CREATE INDEX "emergency_break_log_org_id_broken_at_idx"         ON "emergency_break_log"("org_id","broken_at");

-- BEPWG: Biometric Exchequer & Proximity Withdrawal Gate
-- New tables: location_anchor, trusted_agent_link, bepwg_withdrawal_log

CREATE TABLE "location_anchor" (
    "id"                TEXT          NOT NULL,
    "customer_bvn_hash" TEXT          NOT NULL,
    "tfan_id"           TEXT,
    "latitude_deg"      DECIMAL(10,7) NOT NULL,
    "longitude_deg"     DECIMAL(10,7) NOT NULL,
    "offline_cache_blob" BYTEA        NOT NULL,
    "org_id"            TEXT          NOT NULL DEFAULT 'default',
    "captured_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "location_anchor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "location_anchor_customer_bvn_hash_key" ON "location_anchor"("customer_bvn_hash");
CREATE INDEX "location_anchor_org_id_idx" ON "location_anchor"("org_id");

CREATE TABLE "trusted_agent_link" (
    "id"               TEXT         NOT NULL,
    "customer_bvn_hash" TEXT        NOT NULL,
    "agent_bvn_hash"   TEXT         NOT NULL,
    "cycle_count"      INTEGER      NOT NULL DEFAULT 1,
    "first_linked_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    CONSTRAINT "trusted_agent_link_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trusted_agent_link_customer_agent_org_key"
    ON "trusted_agent_link"("customer_bvn_hash","agent_bvn_hash","org_id");
CREATE INDEX "trusted_agent_link_customer_bvn_hash_idx" ON "trusted_agent_link"("customer_bvn_hash");
CREATE INDEX "trusted_agent_link_agent_bvn_hash_idx"    ON "trusted_agent_link"("agent_bvn_hash");

CREATE TABLE "bepwg_withdrawal_log" (
    "id"                     TEXT          NOT NULL,
    "withdrawal_ref"         TEXT          NOT NULL,
    "cycle_ref"              TEXT          NOT NULL,
    "customer_bvn_hash"      TEXT          NOT NULL,
    "agent_bvn_hash"         TEXT          NOT NULL,
    "gps_latitude"           DECIMAL(10,7) NOT NULL,
    "gps_longitude"          DECIMAL(10,7) NOT NULL,
    "distance_from_anchor_m" DECIMAL(10,2) NOT NULL,
    "within_proximity"       BOOLEAN       NOT NULL,
    "verification_method"    TEXT          NOT NULL,
    "gates_passed_json"      TEXT          NOT NULL,
    "gates_passed_count"     INTEGER       NOT NULL,
    "gross_amount_minor"     DECIMAL(24,0) NOT NULL,
    "penalty_minor"          DECIMAL(24,0) NOT NULL DEFAULT 0,
    "net_amount_minor"       DECIMAL(24,0) NOT NULL,
    "penalty_event_id"       TEXT,
    "cycle_maturity"         TEXT          NOT NULL,
    "org_id"                 TEXT          NOT NULL DEFAULT 'default',
    "executed_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bepwg_withdrawal_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bepwg_withdrawal_log_withdrawal_ref_key" ON "bepwg_withdrawal_log"("withdrawal_ref");
CREATE INDEX "bepwg_withdrawal_log_customer_executed_idx" ON "bepwg_withdrawal_log"("customer_bvn_hash","executed_at");
CREATE INDEX "bepwg_withdrawal_log_cycle_ref_idx"         ON "bepwg_withdrawal_log"("cycle_ref");
CREATE INDEX "bepwg_withdrawal_log_org_executed_idx"      ON "bepwg_withdrawal_log"("org_id","executed_at");

-- LBAS: Liveness, External Biometric & Networkless Authentication Suite

CREATE TABLE "liveness_challenge" (
    "id"               TEXT         NOT NULL,
    "session_token"    TEXT         NOT NULL,
    "customer_bvn_hash" TEXT        NOT NULL,
    "task_sequence_json" TEXT       NOT NULL,
    "task_count"       INTEGER      NOT NULL,
    "status"           TEXT         NOT NULL,
    "proof_json"       TEXT,
    "face_match_result" BOOLEAN,
    "scores_json"      TEXT,
    "expires_at"       TIMESTAMP(3) NOT NULL,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"     TIMESTAMP(3),
    CONSTRAINT "liveness_challenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "liveness_challenge_session_token_key" ON "liveness_challenge"("session_token");
CREATE INDEX "liveness_challenge_customer_created_idx" ON "liveness_challenge"("customer_bvn_hash","created_at");
CREATE INDEX "liveness_challenge_status_expires_idx"   ON "liveness_challenge"("status","expires_at");
CREATE INDEX "liveness_challenge_org_created_idx"      ON "liveness_challenge"("org_id","created_at");

CREATE TABLE "external_sensor_session" (
    "id"                TEXT         NOT NULL,
    "device_id"         TEXT         NOT NULL,
    "sensor_model"      TEXT         NOT NULL,
    "sensor_protocol"   TEXT         NOT NULL,
    "status"            TEXT         NOT NULL,
    "binding_agent_hash" TEXT,
    "org_id"            TEXT         NOT NULL DEFAULT 'default',
    "registered_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at"      TIMESTAMP(3),
    CONSTRAINT "external_sensor_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_sensor_session_device_id_key" ON "external_sensor_session"("device_id");
CREATE INDEX "external_sensor_session_org_status_idx"        ON "external_sensor_session"("org_id","status");
CREATE INDEX "external_sensor_session_binding_agent_hash_idx" ON "external_sensor_session"("binding_agent_hash");

CREATE TABLE "networkless_session" (
    "id"                   TEXT         NOT NULL,
    "session_ref"          TEXT         NOT NULL,
    "cycle_ref"            TEXT         NOT NULL,
    "customer_bvn_hash"    TEXT         NOT NULL,
    "agent_bvn_hash"       TEXT         NOT NULL,
    "terminal_id"          TEXT         NOT NULL,
    "encrypted_totp_seed"  BYTEA        NOT NULL,
    "status"               TEXT         NOT NULL,
    "cognitive_task_json"  TEXT         NOT NULL,
    "cognitive_answer_hash" TEXT        NOT NULL,
    "step_a_confirmed_at"  TIMESTAMP(3),
    "step_b_confirmed_at"  TIMESTAMP(3),
    "expires_at"           TIMESTAMP(3) NOT NULL,
    "org_id"               TEXT         NOT NULL DEFAULT 'default',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "networkless_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "networkless_session_session_ref_key" ON "networkless_session"("session_ref");
CREATE INDEX "networkless_session_customer_created_idx" ON "networkless_session"("customer_bvn_hash","created_at");
CREATE INDEX "networkless_session_terminal_created_idx" ON "networkless_session"("terminal_id","created_at");
CREATE INDEX "networkless_session_status_expires_idx"   ON "networkless_session"("status","expires_at");

CREATE TABLE "lbas_audit_log" (
    "id"               TEXT         NOT NULL,
    "event_type"       TEXT         NOT NULL,
    "session_ref"      TEXT         NOT NULL,
    "customer_bvn_hash" TEXT,
    "agent_bvn_hash"   TEXT,
    "metadata_json"    TEXT,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lbas_audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lbas_audit_log_session_ref_idx"      ON "lbas_audit_log"("session_ref");
CREATE INDEX "lbas_audit_log_customer_created_idx"  ON "lbas_audit_log"("customer_bvn_hash","created_at");
CREATE INDEX "lbas_audit_log_event_created_idx"     ON "lbas_audit_log"("event_type","created_at");
CREATE INDEX "lbas_audit_log_org_created_idx"       ON "lbas_audit_log"("org_id","created_at");

-- UNWP: Universal Networkless Withdrawal Protocol
-- Migration: 20260330280000_unwp

-- ── UnwpSession ──────────────────────────────────────────────────────────────
CREATE TABLE "unwp_session" (
  "id"                   TEXT NOT NULL,
  "session_ref"          TEXT NOT NULL,
  "tli"                  TEXT NOT NULL,
  "account_public_ref"   TEXT NOT NULL,
  "customer_bvn_hash"    TEXT NOT NULL,
  "agent_bvn_hash"       TEXT NOT NULL,
  "terminal_id"          TEXT NOT NULL,
  "device_id"            TEXT,
  "encrypted_totp_seed"  BYTEA NOT NULL,
  "status"               TEXT NOT NULL,
  "cognitive_task_json"  TEXT NOT NULL,
  "cognitive_answer_hash" TEXT NOT NULL,
  "amount_minor"         BIGINT NOT NULL,
  "currency_code"        TEXT NOT NULL DEFAULT 'NGN',
  "escalation_reason"    TEXT,
  "step_a_confirmed_at"  TIMESTAMP(3),
  "step_b_confirmed_at"  TIMESTAMP(3),
  "expires_at"           TIMESTAMP(3) NOT NULL,
  "org_id"               TEXT NOT NULL DEFAULT 'default',
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "unwp_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unwp_session_session_ref_key" ON "unwp_session"("session_ref");
CREATE UNIQUE INDEX "unwp_session_tli_key"         ON "unwp_session"("tli");
CREATE INDEX "unwp_session_customer_bvn_hash_created_at_idx" ON "unwp_session"("customer_bvn_hash","created_at");
CREATE INDEX "unwp_session_terminal_id_status_idx"           ON "unwp_session"("terminal_id","status");
CREATE INDEX "unwp_session_org_id_created_at_idx"            ON "unwp_session"("org_id","created_at");

-- ── PosOfflineLedger ─────────────────────────────────────────────────────────
CREATE TABLE "pos_offline_ledger" (
  "id"                   TEXT NOT NULL,
  "tli"                  TEXT NOT NULL,
  "session_ref"          TEXT NOT NULL,
  "terminal_id"          TEXT NOT NULL,
  "customer_bvn_hash"    TEXT NOT NULL,
  "amount_minor"         BIGINT NOT NULL,
  "currency_code"        TEXT NOT NULL DEFAULT 'NGN',
  "encrypted_payload"    BYTEA NOT NULL,
  "payload_checksum"     TEXT NOT NULL,
  "status"               TEXT NOT NULL DEFAULT 'QUEUED',
  "task_id"              TEXT NOT NULL,
  "biometric_fallback"   BOOLEAN NOT NULL DEFAULT false,
  "device_id"            TEXT,
  "approval_timestamp"   TIMESTAMP(3) NOT NULL,
  "nibss_correlation_id" TEXT,
  "reconciled_at"        TIMESTAMP(3),
  "rejection_reason"     TEXT,
  "org_id"               TEXT NOT NULL DEFAULT 'default',
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_offline_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_offline_ledger_tli_key"         ON "pos_offline_ledger"("tli");
CREATE UNIQUE INDEX "pos_offline_ledger_session_ref_key" ON "pos_offline_ledger"("session_ref");
CREATE INDEX "pos_offline_ledger_terminal_id_status_idx" ON "pos_offline_ledger"("terminal_id","status");
CREATE INDEX "pos_offline_ledger_status_created_at_idx"  ON "pos_offline_ledger"("status","created_at");
CREATE INDEX "pos_offline_ledger_org_id_created_at_idx"  ON "pos_offline_ledger"("org_id","created_at");

ALTER TABLE "pos_offline_ledger"
  ADD CONSTRAINT "pos_offline_ledger_session_ref_fkey"
  FOREIGN KEY ("session_ref")
  REFERENCES "unwp_session"("session_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ZFOE: Zero-Friction Instant Onboarding Engine
-- Migration: 20260330290000_zfoe

-- ── ZfoeSession ──────────────────────────────────────────────────────────────
CREATE TABLE "zfoe_session" (
  "id"                     TEXT NOT NULL,
  "session_ref"            TEXT NOT NULL,
  "msisdn_hash"            TEXT NOT NULL,
  "nibss_token_id"         TEXT,
  "shadow_profile_blob"    BYTEA,
  "status"                 TEXT NOT NULL,
  "selected_bank_code"     TEXT,
  "selected_bank_name"     TEXT,
  "account_type"           TEXT,
  "account_number"         TEXT,
  "bank_api_response"      TEXT,
  "biometric_gate"         TEXT,
  "nibss_biometric_corr_id" TEXT,
  "provision_started_at"   TIMESTAMP(3),
  "completed_at"           TIMESTAMP(3),
  "elapsed_ms"             INTEGER,
  "failure_reason"         TEXT,
  "session_expires_at"     TIMESTAMP(3) NOT NULL,
  "org_id"                 TEXT NOT NULL DEFAULT 'default',
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zfoe_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zfoe_session_session_ref_key"           ON "zfoe_session"("session_ref");
CREATE INDEX "zfoe_session_msisdn_hash_created_at_idx"       ON "zfoe_session"("msisdn_hash","created_at");
CREATE INDEX "zfoe_session_status_created_at_idx"            ON "zfoe_session"("status","created_at");
CREATE INDEX "zfoe_session_selected_bank_code_account_type_idx" ON "zfoe_session"("selected_bank_code","account_type");
CREATE INDEX "zfoe_session_org_id_created_at_idx"            ON "zfoe_session"("org_id","created_at");

-- ── ZfoeAuditLog ─────────────────────────────────────────────────────────────
CREATE TABLE "zfoe_audit_log" (
  "id"                    TEXT NOT NULL,
  "session_ref"           TEXT NOT NULL,
  "event_type"            TEXT NOT NULL,
  "nibss_token_id"        TEXT,
  "bank_api_response"     TEXT,
  "account_gen_timestamp" TIMESTAMP(3),
  "metadata_json"         TEXT,
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zfoe_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "zfoe_audit_log_session_ref_idx"       ON "zfoe_audit_log"("session_ref");
CREATE INDEX "zfoe_audit_log_nibss_token_id_idx"    ON "zfoe_audit_log"("nibss_token_id");
CREATE INDEX "zfoe_audit_log_event_type_created_at_idx" ON "zfoe_audit_log"("event_type","created_at");
CREATE INDEX "zfoe_audit_log_org_id_created_at_idx" ON "zfoe_audit_log"("org_id","created_at");

ALTER TABLE "zfoe_audit_log"
  ADD CONSTRAINT "zfoe_audit_log_session_ref_fkey"
  FOREIGN KEY ("session_ref")
  REFERENCES "zfoe_session"("session_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- BIH: Biometric Identity Harvest & Instant Account Mint
-- Migration: 20260330300000_bih

-- ── BiometricScanSession ──────────────────────────────────────────────────────
CREATE TABLE "biometric_scan_session" (
  "id"                      TEXT NOT NULL,
  "scan_ref"                TEXT NOT NULL,
  "transaction_type"        TEXT NOT NULL,
  "encrypted_minutiae_hash" TEXT,
  "nibss_match_id"          TEXT,
  "nibss_latency_ms"        INTEGER,
  "shadow_profile_blob"     BYTEA,
  "status"                  TEXT NOT NULL,
  "selected_bank_code"      TEXT,
  "selected_bank_name"      TEXT,
  "account_type"            TEXT,
  "account_number"          TEXT,
  "bank_api_response"       TEXT,
  "bank_provisioning_status" TEXT,
  "provision_started_at"    TIMESTAMP(3),
  "completed_at"            TIMESTAMP(3),
  "elapsed_ms"              INTEGER,
  "operation_amount_minor"  BIGINT,
  "operation_recipient_ref" TEXT,
  "operation_biller_code"   TEXT,
  "operation_result"        TEXT,
  "template_purged_at"      TIMESTAMP(3),
  "failure_reason"          TEXT,
  "session_expires_at"      TIMESTAMP(3) NOT NULL,
  "org_id"                  TEXT NOT NULL DEFAULT 'default',
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "biometric_scan_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "biometric_scan_session_scan_ref_key"       ON "biometric_scan_session"("scan_ref");
CREATE UNIQUE INDEX "biometric_scan_session_nibss_match_id_key" ON "biometric_scan_session"("nibss_match_id") WHERE "nibss_match_id" IS NOT NULL;
CREATE INDEX "biometric_scan_session_transaction_type_status_idx" ON "biometric_scan_session"("transaction_type","status");
CREATE INDEX "biometric_scan_session_status_created_at_idx"     ON "biometric_scan_session"("status","created_at");
CREATE INDEX "biometric_scan_session_org_id_created_at_idx"     ON "biometric_scan_session"("org_id","created_at");

-- ── BihAuditLog ───────────────────────────────────────────────────────────────
CREATE TABLE "bih_audit_log" (
  "id"                      TEXT NOT NULL,
  "scan_ref"                TEXT NOT NULL,
  "event_type"              TEXT NOT NULL,
  "nibss_match_id"          TEXT,
  "bank_provisioning_status" TEXT,
  "account_gen_timestamp"   TIMESTAMP(3),
  "scan_latency_ms"         INTEGER,
  "operation_type"          TEXT,
  "metadata_json"           TEXT,
  "org_id"                  TEXT NOT NULL DEFAULT 'default',
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bih_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bih_audit_log_scan_ref_idx"            ON "bih_audit_log"("scan_ref");
CREATE INDEX "bih_audit_log_nibss_match_id_idx"      ON "bih_audit_log"("nibss_match_id");
CREATE INDEX "bih_audit_log_event_type_created_at_idx" ON "bih_audit_log"("event_type","created_at");
CREATE INDEX "bih_audit_log_org_id_created_at_idx"   ON "bih_audit_log"("org_id","created_at");

ALTER TABLE "bih_audit_log"
  ADD CONSTRAINT "bih_audit_log_scan_ref_fkey"
  FOREIGN KEY ("scan_ref")
  REFERENCES "biometric_scan_session"("scan_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- BLS-TSA: Biometric Liquidity Sweep & Two-Step Authorization
-- Migration: 20260330310000_bls

-- ── BlsSession ────────────────────────────────────────────────────────────────
CREATE TABLE "bls_session" (
  "id"                      TEXT NOT NULL,
  "session_ref"             TEXT NOT NULL,
  "session_token"           TEXT NOT NULL,
  "status"                  TEXT NOT NULL,
  "discovery_scan_id"       TEXT,
  "discovery_latency_ms"    INTEGER,
  "discovery_scan_hash"     TEXT,
  "bvn_anchor_hash"         TEXT,
  "account_map_blob"        BYTEA,
  "accounts_wiped_at"       TIMESTAMP(3),
  "template_data_purged_at" TIMESTAMP(3),
  "selected_account_ref"    TEXT,
  "selected_bank_code"      TEXT,
  "selected_bank_name"      TEXT,
  "withdrawal_amount_minor" BIGINT,
  "seal_scan_id"            TEXT,
  "seal_latency_ms"         INTEGER,
  "seal_scan_hash"          TEXT,
  "cross_validation_passed" BOOLEAN,
  "execution_ref"           TEXT,
  "execution_result"        TEXT,
  "failure_reason"          TEXT,
  "idle_expires_at"         TIMESTAMP(3) NOT NULL,
  "session_expires_at"      TIMESTAMP(3) NOT NULL,
  "org_id"                  TEXT NOT NULL DEFAULT 'default',
  "created_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bls_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bls_session_session_ref_key"       ON "bls_session"("session_ref");
CREATE UNIQUE INDEX "bls_session_session_token_key"     ON "bls_session"("session_token");
CREATE UNIQUE INDEX "bls_session_discovery_scan_id_key" ON "bls_session"("discovery_scan_id") WHERE "discovery_scan_id" IS NOT NULL;
CREATE UNIQUE INDEX "bls_session_seal_scan_id_key"      ON "bls_session"("seal_scan_id") WHERE "seal_scan_id" IS NOT NULL;
CREATE INDEX "bls_session_status_created_at_idx"        ON "bls_session"("status","created_at");
CREATE INDEX "bls_session_org_id_created_at_idx"        ON "bls_session"("org_id","created_at");

-- ── BlsAuditLog ───────────────────────────────────────────────────────────────
CREATE TABLE "bls_audit_log" (
  "id"                   TEXT NOT NULL,
  "session_ref"          TEXT NOT NULL,
  "event_type"           TEXT NOT NULL,
  "discovery_scan_id"    TEXT,
  "selected_bank_code"   TEXT,
  "final_auth_scan_id"   TEXT,
  "discovery_latency_ms" INTEGER,
  "seal_latency_ms"      INTEGER,
  "metadata_json"        TEXT,
  "org_id"               TEXT NOT NULL DEFAULT 'default',
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bls_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bls_audit_log_session_ref_idx"         ON "bls_audit_log"("session_ref");
CREATE INDEX "bls_audit_log_discovery_scan_id_idx"   ON "bls_audit_log"("discovery_scan_id");
CREATE INDEX "bls_audit_log_final_auth_scan_id_idx"  ON "bls_audit_log"("final_auth_scan_id");
CREATE INDEX "bls_audit_log_event_type_created_at_idx" ON "bls_audit_log"("event_type","created_at");
CREATE INDEX "bls_audit_log_org_id_created_at_idx"   ON "bls_audit_log"("org_id","created_at");

ALTER TABLE "bls_audit_log"
  ADD CONSTRAINT "bls_audit_log_session_ref_fkey"
  FOREIGN KEY ("session_ref") REFERENCES "bls_session"("session_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- BLIDE: Biometric Liveness & Identity Discovery Engine
-- Migration: 20260330320000_blide

-- ── BlideSession ──────────────────────────────────────────────────────────────
CREATE TABLE "blide_session" (
  "id"                       TEXT NOT NULL,
  "session_ref"              TEXT NOT NULL,
  "transaction_type"         TEXT NOT NULL,
  "status"                   TEXT NOT NULL,
  "face_match_id"            TEXT,
  "face_latency_ms"          INTEGER,
  "face_template_hash"       TEXT,
  "face_template_purged_at"  TIMESTAMP(3),
  "shadow_profile_blob"      BYTEA,
  "account_map_blob"         BYTEA,
  "accounts_wiped_at"        TIMESTAMP(3),
  "selected_account_ref"     TEXT,
  "selected_bank_code"       TEXT,
  "selected_bank_name"       TEXT,
  "selected_account_type"    TEXT,
  "operation_amount_minor"   BIGINT,
  "recipient_ref"            TEXT,
  "biller_code"              TEXT,
  "liveness_verified"        BOOLEAN NOT NULL DEFAULT FALSE,
  "liveness_verified_at"     TIMESTAMP(3),
  "completed_challenge_type" TEXT,
  "account_number"           TEXT,
  "execution_ref"            TEXT,
  "execution_result"         TEXT,
  "failure_reason"           TEXT,
  "nibss_matched_at"         TIMESTAMP(3),
  "completed_at"             TIMESTAMP(3),
  "total_elapsed_ms"         INTEGER,
  "mandate_met"              BOOLEAN,
  "session_expires_at"       TIMESTAMP(3) NOT NULL,
  "org_id"                   TEXT NOT NULL DEFAULT 'default',
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blide_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blide_session_session_ref_key"    ON "blide_session"("session_ref");
CREATE UNIQUE INDEX "blide_session_face_match_id_key"  ON "blide_session"("face_match_id") WHERE "face_match_id" IS NOT NULL;
CREATE INDEX "blide_session_transaction_type_status_idx" ON "blide_session"("transaction_type","status");
CREATE INDEX "blide_session_status_created_at_idx"     ON "blide_session"("status","created_at");
CREATE INDEX "blide_session_org_id_created_at_idx"     ON "blide_session"("org_id","created_at");

-- ── BlideLivenessChallenge ────────────────────────────────────────────────────
CREATE TABLE "blide_liveness_challenge" (
  "id"               TEXT NOT NULL,
  "challenge_id"     TEXT NOT NULL,
  "session_ref"      TEXT NOT NULL,
  "challenge_type"   TEXT NOT NULL,
  "prompt"           TEXT NOT NULL,
  "nonce"            TEXT NOT NULL,
  "consumed"         BOOLEAN NOT NULL DEFAULT FALSE,
  "consumed_at"      TIMESTAMP(3),
  "liveness_verified" BOOLEAN,
  "expires_at"       TIMESTAMP(3) NOT NULL,
  "org_id"           TEXT NOT NULL DEFAULT 'default',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blide_liveness_challenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blide_liveness_challenge_challenge_id_key" ON "blide_liveness_challenge"("challenge_id");
CREATE INDEX "blide_liveness_challenge_session_ref_idx"         ON "blide_liveness_challenge"("session_ref");
CREATE INDEX "blide_liveness_challenge_consumed_expires_at_idx" ON "blide_liveness_challenge"("consumed","expires_at");

ALTER TABLE "blide_liveness_challenge"
  ADD CONSTRAINT "blide_liveness_challenge_session_ref_fkey"
  FOREIGN KEY ("session_ref") REFERENCES "blide_session"("session_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── BlideAuditLog ─────────────────────────────────────────────────────────────
CREATE TABLE "blide_audit_log" (
  "id"               TEXT NOT NULL,
  "session_ref"      TEXT NOT NULL,
  "event_type"       TEXT NOT NULL,
  "face_match_id"    TEXT,
  "liveness_verified" BOOLEAN,
  "challenge_type"   TEXT,
  "transaction_type" TEXT,
  "face_latency_ms"  INTEGER,
  "total_elapsed_ms" INTEGER,
  "metadata_json"    TEXT,
  "org_id"           TEXT NOT NULL DEFAULT 'default',
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blide_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blide_audit_log_session_ref_idx"        ON "blide_audit_log"("session_ref");
CREATE INDEX "blide_audit_log_face_match_id_idx"      ON "blide_audit_log"("face_match_id");
CREATE INDEX "blide_audit_log_event_type_created_idx" ON "blide_audit_log"("event_type","created_at");
CREATE INDEX "blide_audit_log_org_id_created_idx"     ON "blide_audit_log"("org_id","created_at");

ALTER TABLE "blide_audit_log"
  ADD CONSTRAINT "blide_audit_log_session_ref_fkey"
  FOREIGN KEY ("session_ref") REFERENCES "blide_session"("session_ref")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CASD: Command Center — Admin & Settlement Dashboard
-- Migration: 20260330330000_casd

-- ── BankApplication ───────────────────────────────────────────────────────────
CREATE TABLE "bank_application" (
  "id"                  TEXT NOT NULL,
  "bank_name"           TEXT NOT NULL,
  "bank_code"           TEXT,
  "bank_category"       TEXT NOT NULL,
  "contact_name"        TEXT NOT NULL,
  "contact_email"       TEXT NOT NULL,
  "contact_phone"       TEXT NOT NULL,
  "country"             TEXT NOT NULL DEFAULT 'NG',
  "registration_number" TEXT,
  "status"              TEXT NOT NULL,
  "reviewer_notes"      TEXT,
  "approved_at"         TIMESTAMP(3),
  "rejected_at"         TIMESTAMP(3),
  "push_count"          INTEGER NOT NULL DEFAULT 0,
  "org_id"              TEXT NOT NULL DEFAULT 'default',
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_application_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_application_bank_code_key" ON "bank_application"("bank_code") WHERE "bank_code" IS NOT NULL;
CREATE INDEX "bank_application_status_created_at_idx" ON "bank_application"("status","created_at");
CREATE INDEX "bank_application_org_id_created_at_idx" ON "bank_application"("org_id","created_at");

-- ── BankDocument ──────────────────────────────────────────────────────────────
CREATE TABLE "bank_document" (
  "id"                  TEXT NOT NULL,
  "bank_application_id" TEXT NOT NULL,
  "document_type"       TEXT NOT NULL,
  "document_name"       TEXT NOT NULL,
  "document_url"        TEXT,
  "document_hash"       TEXT,
  "file_size_bytes"     INTEGER,
  "mime_type"           TEXT,
  "verified_at"         TIMESTAMP(3),
  "verified_by"         TEXT,
  "org_id"              TEXT NOT NULL DEFAULT 'default',
  "uploaded_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bank_document_bank_application_id_idx" ON "bank_document"("bank_application_id");
CREATE INDEX "bank_document_document_type_idx"        ON "bank_document"("document_type");
ALTER TABLE "bank_document"
  ADD CONSTRAINT "bank_document_bank_application_id_fkey"
  FOREIGN KEY ("bank_application_id") REFERENCES "bank_application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── SovereignDocument ─────────────────────────────────────────────────────────
CREATE TABLE "sovereign_document" (
  "id"                TEXT NOT NULL,
  "document_type"     TEXT NOT NULL,
  "document_name"     TEXT NOT NULL,
  "issuing_authority" TEXT NOT NULL,
  "issue_date"        TIMESTAMP(3) NOT NULL,
  "expiry_date"       TIMESTAMP(3),
  "document_hash"     TEXT NOT NULL,
  "is_active"         BOOLEAN NOT NULL DEFAULT TRUE,
  "download_count"    INTEGER NOT NULL DEFAULT 0,
  "org_id"            TEXT NOT NULL DEFAULT 'default',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sovereign_document_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sovereign_document_type_active_idx" ON "sovereign_document"("document_type","is_active");
CREATE INDEX "sovereign_document_org_id_idx"       ON "sovereign_document"("org_id");

-- ── BankDocPush ───────────────────────────────────────────────────────────────
CREATE TABLE "bank_doc_push" (
  "id"                    TEXT NOT NULL,
  "bank_application_id"   TEXT NOT NULL,
  "sovereign_document_id" TEXT,
  "push_type"             TEXT NOT NULL,
  "recipient_email"       TEXT NOT NULL,
  "delivery_status"       TEXT NOT NULL,
  "sent_at"               TIMESTAMP(3),
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_doc_push_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bank_doc_push_bank_application_id_idx"   ON "bank_doc_push"("bank_application_id");
CREATE INDEX "bank_doc_push_sovereign_document_id_idx" ON "bank_doc_push"("sovereign_document_id");
CREATE INDEX "bank_doc_push_delivery_status_idx"        ON "bank_doc_push"("delivery_status","created_at");
CREATE INDEX "bank_doc_push_org_id_created_at_idx"      ON "bank_doc_push"("org_id","created_at");
ALTER TABLE "bank_doc_push"
  ADD CONSTRAINT "bank_doc_push_bank_application_id_fkey"
  FOREIGN KEY ("bank_application_id") REFERENCES "bank_application"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_doc_push"
  ADD CONSTRAINT "bank_doc_push_sovereign_document_id_fkey"
  FOREIGN KEY ("sovereign_document_id") REFERENCES "sovereign_document"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- RSCC: Revenue & Settlement Command Center
-- Migration: 20260330340000_rscc

CREATE TABLE "bank_license" (
  "id"                    TEXT NOT NULL,
  "bank_application_id"   TEXT NOT NULL,
  "bank_name"             TEXT NOT NULL,
  "bank_code"             TEXT,
  "license_key"           TEXT NOT NULL,
  "renewal_fee_minor"     BIGINT NOT NULL DEFAULT 50000000,
  "license_start_date"    TIMESTAMP(3) NOT NULL,
  "license_end_date"      TIMESTAMP(3) NOT NULL,
  "status"                TEXT NOT NULL,
  "api_access_restricted" BOOLEAN NOT NULL DEFAULT FALSE,
  "renewal_confirmed_at"  TIMESTAMP(3),
  "renewal_confirmed_by"  TEXT,
  "dedicated_acct_balance" BIGINT NOT NULL DEFAULT 0,
  "last_status_check_at"  TIMESTAMP(3),
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_license_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_license_license_key_key" ON "bank_license"("license_key");
CREATE INDEX "bank_license_status_idx"             ON "bank_license"("status");
CREATE INDEX "bank_license_end_date_idx"           ON "bank_license"("license_end_date");
CREATE INDEX "bank_license_bank_app_id_idx"        ON "bank_license"("bank_application_id");
CREATE INDEX "bank_license_org_id_idx"             ON "bank_license"("org_id");

CREATE TABLE "switching_toll" (
  "id"                TEXT NOT NULL,
  "session_ref"       TEXT NOT NULL,
  "session_type"      TEXT NOT NULL,
  "toll_type"         TEXT NOT NULL,
  "fee_minor"         BIGINT NOT NULL,
  "bank_code"         TEXT,
  "bank_name"         TEXT,
  "agent_id"          TEXT,
  "agent_state"       TEXT,
  "agent_lga"         TEXT,
  "ten_m_rule_applied" BOOLEAN NOT NULL DEFAULT FALSE,
  "amount_minor"      BIGINT,
  "org_id"            TEXT NOT NULL DEFAULT 'default',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "switching_toll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "switching_toll_session_type_idx" ON "switching_toll"("session_type","created_at");
CREATE INDEX "switching_toll_toll_type_idx"    ON "switching_toll"("toll_type","created_at");
CREATE INDEX "switching_toll_bank_code_idx"    ON "switching_toll"("bank_code","created_at");
CREATE INDEX "switching_toll_agent_geo_idx"    ON "switching_toll"("agent_state","agent_lga");
CREATE INDEX "switching_toll_org_id_idx"       ON "switching_toll"("org_id","created_at");

CREATE TABLE "ajo_account" (
  "id"                       TEXT NOT NULL,
  "account_ref"              TEXT NOT NULL,
  "holder_name"              TEXT NOT NULL,
  "holder_bvn_masked"        TEXT NOT NULL,
  "bank_code"                TEXT NOT NULL,
  "bank_name"                TEXT NOT NULL,
  "cycle_start_date"         TIMESTAMP(3) NOT NULL,
  "cycle_length_days"        INTEGER NOT NULL DEFAULT 31,
  "status"                   TEXT NOT NULL,
  "day1_fee_minor"           BIGINT NOT NULL DEFAULT 50000,
  "day1_fee_status"          TEXT NOT NULL DEFAULT 'PENDING',
  "day1_fee_collected_at"    TIMESTAMP(3),
  "target_amount_minor"      BIGINT NOT NULL,
  "current_balance_minor"    BIGINT NOT NULL DEFAULT 0,
  "safe_break_penalty_minor" BIGINT,
  "org_id"                   TEXT NOT NULL DEFAULT 'default',
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ajo_account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ajo_account_ref_key"       ON "ajo_account"("account_ref");
CREATE INDEX "ajo_account_status_idx"           ON "ajo_account"("status","created_at");
CREATE INDEX "ajo_account_bank_code_idx"        ON "ajo_account"("bank_code");
CREATE INDEX "ajo_account_day1_fee_status_idx"  ON "ajo_account"("day1_fee_status");
CREATE INDEX "ajo_account_org_id_idx"           ON "ajo_account"("org_id","created_at");

CREATE TABLE "agent_liquidity_distribution" (
  "id"                    TEXT NOT NULL,
  "distribution_date"     TIMESTAMP(3) NOT NULL,
  "total_day1_fees_minor" BIGINT NOT NULL,
  "fman_share_minor"      BIGINT NOT NULL,
  "agent_pool_minor"      BIGINT NOT NULL,
  "two_percent_pool_minor" BIGINT NOT NULL,
  "reward_per_agent_minor" BIGINT NOT NULL,
  "total_agents_eligible" INTEGER NOT NULL,
  "status"                TEXT NOT NULL,
  "disbursed_at"          TIMESTAMP(3),
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_liquidity_distribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_dist_date_idx"   ON "agent_liquidity_distribution"("distribution_date");
CREATE INDEX "agent_dist_status_idx" ON "agent_liquidity_distribution"("status");
CREATE INDEX "agent_dist_org_idx"    ON "agent_liquidity_distribution"("org_id");

CREATE TABLE "dedicated_account_balance" (
  "id"                        TEXT NOT NULL,
  "bank_application_id"       TEXT NOT NULL,
  "bank_name"                 TEXT NOT NULL,
  "bank_code"                 TEXT,
  "balance_minor"             BIGINT NOT NULL,
  "projected_payout_48h_minor" BIGINT NOT NULL,
  "red_flag_triggered"        BOOLEAN NOT NULL DEFAULT FALSE,
  "red_flag_triggered_at"     TIMESTAMP(3),
  "last_reconciled_at"        TIMESTAMP(3) NOT NULL,
  "org_id"                    TEXT NOT NULL DEFAULT 'default',
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dedicated_account_balance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dedicated_acct_bank_app_key" ON "dedicated_account_balance"("bank_application_id");
CREATE INDEX "dedicated_acct_red_flag_idx"        ON "dedicated_account_balance"("red_flag_triggered");
CREATE INDEX "dedicated_acct_org_id_idx"          ON "dedicated_account_balance"("org_id");

CREATE TABLE "admin_red_flag" (
  "id"          TEXT NOT NULL,
  "flag_type"   TEXT NOT NULL,
  "severity"    TEXT NOT NULL,
  "bank_code"   TEXT,
  "bank_name"   TEXT,
  "message"     TEXT NOT NULL,
  "is_resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" TEXT,
  "org_id"      TEXT NOT NULL DEFAULT 'default',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_red_flag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_red_flag_resolved_idx"  ON "admin_red_flag"("is_resolved","created_at");
CREATE INDEX "admin_red_flag_type_idx"      ON "admin_red_flag"("flag_type");
CREATE INDEX "admin_red_flag_severity_idx"  ON "admin_red_flag"("severity");
CREATE INDEX "admin_red_flag_org_id_idx"    ON "admin_red_flag"("org_id");

-- ZFPS: Zero-Friction Provisioning Stack
-- Migration: 20260330350000_zfps

CREATE TABLE "bank_api_latency_log" (
  "id"              TEXT NOT NULL,
  "bank_code"       TEXT NOT NULL,
  "bank_name"       TEXT NOT NULL,
  "session_ref"     TEXT NOT NULL,
  "operation_type"  TEXT NOT NULL,
  "latency_ms"      INTEGER NOT NULL,
  "status_code"     INTEGER,
  "succeeded"       BOOLEAN NOT NULL,
  "alert_triggered" BOOLEAN NOT NULL DEFAULT FALSE,
  "org_id"          TEXT NOT NULL DEFAULT 'default',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_api_latency_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bal_bank_code_idx"      ON "bank_api_latency_log"("bank_code","created_at");
CREATE INDEX "bal_latency_ms_idx"     ON "bank_api_latency_log"("latency_ms");
CREATE INDEX "bal_alert_idx"          ON "bank_api_latency_log"("alert_triggered");
CREATE INDEX "bal_org_id_idx"         ON "bank_api_latency_log"("org_id","created_at");

CREATE TABLE "zfps_provisioning_event" (
  "id"                     TEXT NOT NULL,
  "session_ref"            TEXT NOT NULL,
  "bank_code"              TEXT NOT NULL,
  "bank_name"              TEXT NOT NULL,
  "account_type"           TEXT NOT NULL,
  "nibss_match_id"         TEXT NOT NULL,
  "iso20022_msg_id"        TEXT NOT NULL,
  "vault_opened_at"        TIMESTAMP(3) NOT NULL,
  "vault_closed_at"        TIMESTAMP(3),
  "cbs_latency_ms"         INTEGER,
  "account_number_masked"  TEXT,
  "status"                 TEXT NOT NULL,
  "sms_sent_at"            TIMESTAMP(3),
  "sms_delivered"          BOOLEAN,
  "sms_provider"           TEXT,
  "mandate_met"            BOOLEAN,
  "org_id"                 TEXT NOT NULL DEFAULT 'default',
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"           TIMESTAMP(3),
  CONSTRAINT "zfps_provisioning_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zfps_event_session_ref_key" ON "zfps_provisioning_event"("session_ref");
CREATE INDEX "zfps_event_status_idx"   ON "zfps_provisioning_event"("status","created_at");
CREATE INDEX "zfps_event_bank_idx"     ON "zfps_provisioning_event"("bank_code","created_at");
CREATE INDEX "zfps_event_nibss_idx"    ON "zfps_provisioning_event"("nibss_match_id");
CREATE INDEX "zfps_event_org_idx"      ON "zfps_provisioning_event"("org_id","created_at");

CREATE TABLE "sms_send_log" (
  "id"              TEXT NOT NULL,
  "recipient"       TEXT NOT NULL,
  "message_type"    TEXT NOT NULL,
  "session_ref"     TEXT,
  "provider"        TEXT NOT NULL,
  "message_body"    TEXT NOT NULL,
  "provider_msg_id" TEXT,
  "status"          TEXT NOT NULL,
  "sent_at"         TIMESTAMP(3),
  "org_id"          TEXT NOT NULL DEFAULT 'default',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_send_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_recipient_idx"   ON "sms_send_log"("recipient");
CREATE INDEX "sms_status_idx"      ON "sms_send_log"("status","created_at");
CREATE INDEX "sms_session_ref_idx" ON "sms_send_log"("session_ref");
CREATE INDEX "sms_org_id_idx"      ON "sms_send_log"("org_id","created_at");




-- ============================================================
-- SUPABASE REALTIME � Enable on live-update tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE zfps_provisioning_event;
ALTER PUBLICATION supabase_realtime ADD TABLE bank_api_latency_log;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_send_log;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_red_flag;
ALTER PUBLICATION supabase_realtime ADD TABLE bank_license;
