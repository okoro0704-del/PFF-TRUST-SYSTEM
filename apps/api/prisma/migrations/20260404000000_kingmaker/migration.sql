-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260404000000_kingmaker
-- PFF-TRUST · Kingmaker Sovereign Vault Partner Protocol
-- Adds: sovereign_partner, sovereign_vault, kingmaker_audit_log
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sovereign_partner ────────────────────────────────────────────────────────
CREATE TABLE "sovereign_partner" (
  "id"                    TEXT         NOT NULL,
  "bank_code"             TEXT         NOT NULL,
  "bank_name"             TEXT         NOT NULL,
  "api_endpoint"          TEXT         NOT NULL,
  "license_key_hash"      TEXT         NOT NULL,
  "status"                TEXT         NOT NULL DEFAULT 'PENDING',
  "contact_email"         TEXT         NOT NULL,
  "contact_name"          TEXT         NOT NULL,
  "cbn_licence_ref"       TEXT         NOT NULL,
  "admin_note"            TEXT,
  "applied_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at"           TIMESTAMP(3),
  "suspended_at"          TIMESTAMP(3),
  "revoked_at"            TIMESTAMP(3),
  "total_vaults_created"  INTEGER      NOT NULL DEFAULT 0,
  "total_vaults_flipped"  INTEGER      NOT NULL DEFAULT 0,
  "total_flip_failures"   INTEGER      NOT NULL DEFAULT 0,
  "total_tvl_minor"       BIGINT       NOT NULL DEFAULT 0,
  "avg_flip_latency_ms"   INTEGER      NOT NULL DEFAULT 0,
  "api_uptime_pct"        DECIMAL(5,2) NOT NULL DEFAULT 100,
  "org_id"                TEXT         NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sovereign_partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sovereign_partner_bank_code_key" ON "sovereign_partner"("bank_code");
CREATE INDEX "sovereign_partner_status_idx"          ON "sovereign_partner"("status");
CREATE INDEX "sovereign_partner_bank_code_idx"       ON "sovereign_partner"("bank_code");
CREATE INDEX "sovereign_partner_org_status_idx"      ON "sovereign_partner"("org_id", "status");

-- ── sovereign_vault ───────────────────────────────────────────────────────────
CREATE TABLE "sovereign_vault" (
  "id"                    TEXT         NOT NULL,
  "ajo_account_ref"       TEXT         NOT NULL,
  "partner_bank_code"     TEXT         NOT NULL,
  "partner_bank_name"     TEXT         NOT NULL,
  "encrypted_nuban"       TEXT         NOT NULL,
  "partner_vault_ref"     TEXT         NOT NULL,
  "vault_status"          TEXT         NOT NULL DEFAULT 'SOVEREIGN_RESTRICTED',
  "legacy_bank_code"      TEXT,
  "legacy_bank_name"      TEXT,
  "target_amount_minor"   BIGINT       NOT NULL,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "flip_scheduled_for"    TIMESTAMP(3),
  "flipped_at"            TIMESTAMP(3),
  "withdrawn_at"          TIMESTAMP(3),
  "flip_latency_ms"       INTEGER,
  "org_id"                TEXT         NOT NULL DEFAULT 'default',

  CONSTRAINT "sovereign_vault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sovereign_vault_ajo_ref_idx"            ON "sovereign_vault"("ajo_account_ref");
CREATE INDEX "sovereign_vault_partner_status_idx"     ON "sovereign_vault"("partner_bank_code", "vault_status");
CREATE INDEX "sovereign_vault_status_flip_idx"        ON "sovereign_vault"("vault_status", "flip_scheduled_for");
CREATE INDEX "sovereign_vault_legacy_bank_idx"        ON "sovereign_vault"("legacy_bank_code");
CREATE INDEX "sovereign_vault_org_created_idx"        ON "sovereign_vault"("org_id", "created_at");

ALTER TABLE "sovereign_vault"
  ADD CONSTRAINT "sovereign_vault_partner_bank_code_fkey"
  FOREIGN KEY ("partner_bank_code")
  REFERENCES "sovereign_partner"("bank_code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── kingmaker_audit_log ───────────────────────────────────────────────────────
CREATE TABLE "kingmaker_audit_log" (
  "id"                TEXT         NOT NULL,
  "event_type"        TEXT         NOT NULL,
  "vault_ref"         TEXT,
  "ajo_account_ref"   TEXT,
  "partner_bank_code" TEXT,
  "legacy_bank_code"  TEXT,
  "amount_minor"      BIGINT,
  "latency_ms"        INTEGER,
  "metadata_json"     TEXT,
  "org_id"            TEXT         NOT NULL DEFAULT 'default',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "kingmaker_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kingmaker_audit_event_idx"   ON "kingmaker_audit_log"("event_type", "created_at");
CREATE INDEX "kingmaker_audit_partner_idx" ON "kingmaker_audit_log"("partner_bank_code", "created_at");
CREATE INDEX "kingmaker_audit_vault_idx"   ON "kingmaker_audit_log"("vault_ref");
CREATE INDEX "kingmaker_audit_org_idx"     ON "kingmaker_audit_log"("org_id", "created_at");

