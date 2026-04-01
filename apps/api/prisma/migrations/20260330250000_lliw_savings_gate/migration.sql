-- LLIW: Liquidity-Linked Incentive & Withdrawal Gate
-- Four new tables: savings_cycle, daily_deposit_log, agent_incentive_log, emergency_break_log

CREATE TABLE "savings_cycle" (
    "id"                    TEXT        NOT NULL,
    "cycle_ref"             TEXT        NOT NULL,
    "customer_bvn_hash"     TEXT        NOT NULL,
    "agent_bvn_hash"        TEXT        NOT NULL,
    "day1_total_fee_minor"  DECIMAL(24,0) NOT NULL,
    "agent_liquidity_minor" DECIMAL(24,0) NOT NULL,
    "daily_deposit_minor"   DECIMAL(24,0) NOT NULL,
    "total_saved_minor"     DECIMAL(24,0) NOT NULL DEFAULT 0,
    "days_saved"            INTEGER     NOT NULL DEFAULT 0,
    "currency_code"         TEXT        NOT NULL,
    "partner_bank"          TEXT        NOT NULL,
    "status"                TEXT        NOT NULL,
    "withdrawal_gate_status" TEXT       NOT NULL DEFAULT 'LOCKED',
    "start_date"            TIMESTAMP(3) NOT NULL,
    "maturity_unlocked_at"  TIMESTAMP(3),
    "withdrawn_at"          TIMESTAMP(3),
    "penalty_event_id"      TEXT,
    "penalty_minor"         DECIMAL(24,0),
    "net_payout_minor"      DECIMAL(24,0),
    "org_id"                TEXT        NOT NULL DEFAULT 'default',
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,
    CONSTRAINT "savings_cycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "savings_cycle_cycle_ref_key" ON "savings_cycle"("cycle_ref");
CREATE INDEX "savings_cycle_customer_bvn_hash_idx" ON "savings_cycle"("customer_bvn_hash");
CREATE INDEX "savings_cycle_agent_bvn_hash_idx"    ON "savings_cycle"("agent_bvn_hash");
CREATE INDEX "savings_cycle_org_id_status_idx"     ON "savings_cycle"("org_id", "status");
CREATE INDEX "savings_cycle_status_days_saved_idx" ON "savings_cycle"("status", "days_saved");

CREATE TABLE "daily_deposit_log" (
    "id"                        TEXT        NOT NULL,
    "cycle_id"                  TEXT        NOT NULL,
    "day_number"                INTEGER     NOT NULL,
    "amount_minor"              DECIMAL(24,0) NOT NULL,
    "biometric_validation_hash" TEXT,
    "deposited_at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "org_id"                    TEXT        NOT NULL DEFAULT 'default',
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_deposit_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_deposit_log_cycle_id_fkey" FOREIGN KEY ("cycle_id")
        REFERENCES "savings_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "daily_deposit_log_cycle_id_day_number_key" ON "daily_deposit_log"("cycle_id","day_number");
CREATE INDEX "daily_deposit_log_cycle_id_deposited_at_idx" ON "daily_deposit_log"("cycle_id","deposited_at");

CREATE TABLE "agent_incentive_log" (
    "id"                     TEXT        NOT NULL,
    "cycle_id"               TEXT        NOT NULL,
    "deposit_id"             TEXT        NOT NULL,
    "day_number"             INTEGER     NOT NULL,
    "incentive_amount_minor" DECIMAL(24,0) NOT NULL,
    "agent_bvn_hash"         TEXT        NOT NULL,
    "partner_bank"           TEXT        NOT NULL,
    "status"                 TEXT        NOT NULL DEFAULT 'PENDING',
    "settled_at"             TIMESTAMP(3),
    "org_id"                 TEXT        NOT NULL DEFAULT 'default',
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_incentive_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_incentive_log_cycle_id_fkey"   FOREIGN KEY ("cycle_id")
        REFERENCES "savings_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agent_incentive_log_deposit_id_fkey" FOREIGN KEY ("deposit_id")
        REFERENCES "daily_deposit_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "agent_incentive_log_deposit_id_key" ON "agent_incentive_log"("deposit_id");
CREATE INDEX "agent_incentive_log_agent_bvn_hash_created_at_idx" ON "agent_incentive_log"("agent_bvn_hash","created_at");
CREATE INDEX "agent_incentive_log_cycle_id_idx" ON "agent_incentive_log"("cycle_id");
CREATE INDEX "agent_incentive_log_status_idx"   ON "agent_incentive_log"("status");

CREATE TABLE "emergency_break_log" (
    "id"               TEXT        NOT NULL,
    "penalty_event_id" TEXT        NOT NULL,
    "cycle_id"         TEXT        NOT NULL,
    "customer_bvn_hash" TEXT       NOT NULL,
    "agent_bvn_hash"   TEXT        NOT NULL,
    "total_saved_minor" DECIMAL(24,0) NOT NULL,
    "penalty_minor"    DECIMAL(24,0) NOT NULL,
    "net_payout_minor" DECIMAL(24,0) NOT NULL,
    "days_broken_at"   INTEGER     NOT NULL,
    "org_id"           TEXT        NOT NULL DEFAULT 'default',
    "broken_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emergency_break_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "emergency_break_log_penalty_event_id_key" ON "emergency_break_log"("penalty_event_id");
CREATE UNIQUE INDEX "emergency_break_log_cycle_id_key"          ON "emergency_break_log"("cycle_id");
CREATE INDEX "emergency_break_log_customer_bvn_hash_idx"        ON "emergency_break_log"("customer_bvn_hash");
CREATE INDEX "emergency_break_log_org_id_broken_at_idx"         ON "emergency_break_log"("org_id","broken_at");

