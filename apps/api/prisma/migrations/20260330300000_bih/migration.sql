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

