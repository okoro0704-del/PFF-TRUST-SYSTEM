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

