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

