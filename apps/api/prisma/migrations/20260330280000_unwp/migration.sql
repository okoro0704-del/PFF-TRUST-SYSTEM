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

