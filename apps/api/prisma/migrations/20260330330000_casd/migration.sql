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

