-- BEPWG: Biometric Exchequer & Proximity Withdrawal Gate
-- New tables: location_anchor, trusted_agent_link, bepwg_withdrawal_log

CREATE TABLE "location_anchor" (
    "id"                TEXT          NOT NULL,
    "customer_bvn_hash" TEXT          NOT NULL,
    "tfan_id"           TEXT,
    "latitude_deg"      DECIMAL(10,7) NOT NULL,
    "longitude_deg"     DECIMAL(10,7) NOT NULL,
    "offline_cache_blob" BYTEA        NOT NULL,
    "org_id"            TEXT          NOT NULL DEFAULT 'default',
    "captured_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "location_anchor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "location_anchor_customer_bvn_hash_key" ON "location_anchor"("customer_bvn_hash");
CREATE INDEX "location_anchor_org_id_idx" ON "location_anchor"("org_id");

CREATE TABLE "trusted_agent_link" (
    "id"               TEXT         NOT NULL,
    "customer_bvn_hash" TEXT        NOT NULL,
    "agent_bvn_hash"   TEXT         NOT NULL,
    "cycle_count"      INTEGER      NOT NULL DEFAULT 1,
    "first_linked_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "org_id"           TEXT         NOT NULL DEFAULT 'default',
    CONSTRAINT "trusted_agent_link_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trusted_agent_link_customer_agent_org_key"
    ON "trusted_agent_link"("customer_bvn_hash","agent_bvn_hash","org_id");
CREATE INDEX "trusted_agent_link_customer_bvn_hash_idx" ON "trusted_agent_link"("customer_bvn_hash");
CREATE INDEX "trusted_agent_link_agent_bvn_hash_idx"    ON "trusted_agent_link"("agent_bvn_hash");

CREATE TABLE "bepwg_withdrawal_log" (
    "id"                     TEXT          NOT NULL,
    "withdrawal_ref"         TEXT          NOT NULL,
    "cycle_ref"              TEXT          NOT NULL,
    "customer_bvn_hash"      TEXT          NOT NULL,
    "agent_bvn_hash"         TEXT          NOT NULL,
    "gps_latitude"           DECIMAL(10,7) NOT NULL,
    "gps_longitude"          DECIMAL(10,7) NOT NULL,
    "distance_from_anchor_m" DECIMAL(10,2) NOT NULL,
    "within_proximity"       BOOLEAN       NOT NULL,
    "verification_method"    TEXT          NOT NULL,
    "gates_passed_json"      TEXT          NOT NULL,
    "gates_passed_count"     INTEGER       NOT NULL,
    "gross_amount_minor"     DECIMAL(24,0) NOT NULL,
    "penalty_minor"          DECIMAL(24,0) NOT NULL DEFAULT 0,
    "net_amount_minor"       DECIMAL(24,0) NOT NULL,
    "penalty_event_id"       TEXT,
    "cycle_maturity"         TEXT          NOT NULL,
    "org_id"                 TEXT          NOT NULL DEFAULT 'default',
    "executed_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bepwg_withdrawal_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bepwg_withdrawal_log_withdrawal_ref_key" ON "bepwg_withdrawal_log"("withdrawal_ref");
CREATE INDEX "bepwg_withdrawal_log_customer_executed_idx" ON "bepwg_withdrawal_log"("customer_bvn_hash","executed_at");
CREATE INDEX "bepwg_withdrawal_log_cycle_ref_idx"         ON "bepwg_withdrawal_log"("cycle_ref");
CREATE INDEX "bepwg_withdrawal_log_org_executed_idx"      ON "bepwg_withdrawal_log"("org_id","executed_at");

