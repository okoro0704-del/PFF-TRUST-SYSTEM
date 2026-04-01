-- Migration: add bvn_hash to verification_ledger for consecutive-failure rate limiting
-- This column is nullable so all existing rows are unaffected.

ALTER TABLE "verification_ledger"
  ADD COLUMN IF NOT EXISTS "bvn_hash" TEXT;

-- Composite index: look up the last N ledger rows for a given BVN hash efficiently
CREATE INDEX IF NOT EXISTS "verification_ledger_bvn_hash_created_at_idx"
  ON "verification_ledger" ("bvn_hash", "created_at");

