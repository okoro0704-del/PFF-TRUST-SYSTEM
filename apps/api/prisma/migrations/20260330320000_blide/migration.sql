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

