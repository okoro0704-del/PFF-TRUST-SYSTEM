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

