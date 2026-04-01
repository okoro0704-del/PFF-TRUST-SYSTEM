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

