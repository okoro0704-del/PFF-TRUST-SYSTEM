-- LBAS: Liveness, External Biometric & Networkless Authentication Suite

CREATE TABLE "liveness_challenge" (
    "id"               TEXT         NOT NULL,
    "session_token"    TEXT         NOT NULL,
    "customer_bvn_hash" TEXT        NOT NULL,
    "task_sequence_json" TEXT       NOT NULL,
    "task_count"       INTEGER      NOT NULL,
    "status"           TEXT         NOT NULL,
    "proof_json"       TEXT,
    "face_match_result" BOOLEAN,
    "scores_json"      TEXT,
    "expires_at"       TIMESTAMP(3) NOT NULL,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"     TIMESTAMP(3),
    CONSTRAINT "liveness_challenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "liveness_challenge_session_token_key" ON "liveness_challenge"("session_token");
CREATE INDEX "liveness_challenge_customer_created_idx" ON "liveness_challenge"("customer_bvn_hash","created_at");
CREATE INDEX "liveness_challenge_status_expires_idx"   ON "liveness_challenge"("status","expires_at");
CREATE INDEX "liveness_challenge_org_created_idx"      ON "liveness_challenge"("org_id","created_at");

CREATE TABLE "external_sensor_session" (
    "id"                TEXT         NOT NULL,
    "device_id"         TEXT         NOT NULL,
    "sensor_model"      TEXT         NOT NULL,
    "sensor_protocol"   TEXT         NOT NULL,
    "status"            TEXT         NOT NULL,
    "binding_agent_hash" TEXT,
    "org_id"            TEXT         NOT NULL DEFAULT 'default',
    "registered_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at"      TIMESTAMP(3),
    CONSTRAINT "external_sensor_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_sensor_session_device_id_key" ON "external_sensor_session"("device_id");
CREATE INDEX "external_sensor_session_org_status_idx"        ON "external_sensor_session"("org_id","status");
CREATE INDEX "external_sensor_session_binding_agent_hash_idx" ON "external_sensor_session"("binding_agent_hash");

CREATE TABLE "networkless_session" (
    "id"                   TEXT         NOT NULL,
    "session_ref"          TEXT         NOT NULL,
    "cycle_ref"            TEXT         NOT NULL,
    "customer_bvn_hash"    TEXT         NOT NULL,
    "agent_bvn_hash"       TEXT         NOT NULL,
    "terminal_id"          TEXT         NOT NULL,
    "encrypted_totp_seed"  BYTEA        NOT NULL,
    "status"               TEXT         NOT NULL,
    "cognitive_task_json"  TEXT         NOT NULL,
    "cognitive_answer_hash" TEXT        NOT NULL,
    "step_a_confirmed_at"  TIMESTAMP(3),
    "step_b_confirmed_at"  TIMESTAMP(3),
    "expires_at"           TIMESTAMP(3) NOT NULL,
    "org_id"               TEXT         NOT NULL DEFAULT 'default',
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "networkless_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "networkless_session_session_ref_key" ON "networkless_session"("session_ref");
CREATE INDEX "networkless_session_customer_created_idx" ON "networkless_session"("customer_bvn_hash","created_at");
CREATE INDEX "networkless_session_terminal_created_idx" ON "networkless_session"("terminal_id","created_at");
CREATE INDEX "networkless_session_status_expires_idx"   ON "networkless_session"("status","expires_at");

CREATE TABLE "lbas_audit_log" (
    "id"               TEXT         NOT NULL,
    "event_type"       TEXT         NOT NULL,
    "session_ref"      TEXT         NOT NULL,
    "customer_bvn_hash" TEXT,
    "agent_bvn_hash"   TEXT,
    "metadata_json"    TEXT,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lbas_audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lbas_audit_log_session_ref_idx"      ON "lbas_audit_log"("session_ref");
CREATE INDEX "lbas_audit_log_customer_created_idx"  ON "lbas_audit_log"("customer_bvn_hash","created_at");
CREATE INDEX "lbas_audit_log_event_created_idx"     ON "lbas_audit_log"("event_type","created_at");
CREATE INDEX "lbas_audit_log_org_created_idx"       ON "lbas_audit_log"("org_id","created_at");

