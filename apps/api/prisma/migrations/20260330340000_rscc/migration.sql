-- RSCC: Revenue & Settlement Command Center
-- Migration: 20260330340000_rscc

CREATE TABLE "bank_license" (
  "id"                    TEXT NOT NULL,
  "bank_application_id"   TEXT NOT NULL,
  "bank_name"             TEXT NOT NULL,
  "bank_code"             TEXT,
  "license_key"           TEXT NOT NULL,
  "renewal_fee_minor"     BIGINT NOT NULL DEFAULT 50000000,
  "license_start_date"    TIMESTAMP(3) NOT NULL,
  "license_end_date"      TIMESTAMP(3) NOT NULL,
  "status"                TEXT NOT NULL,
  "api_access_restricted" BOOLEAN NOT NULL DEFAULT FALSE,
  "renewal_confirmed_at"  TIMESTAMP(3),
  "renewal_confirmed_by"  TEXT,
  "dedicated_acct_balance" BIGINT NOT NULL DEFAULT 0,
  "last_status_check_at"  TIMESTAMP(3),
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_license_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_license_license_key_key" ON "bank_license"("license_key");
CREATE INDEX "bank_license_status_idx"             ON "bank_license"("status");
CREATE INDEX "bank_license_end_date_idx"           ON "bank_license"("license_end_date");
CREATE INDEX "bank_license_bank_app_id_idx"        ON "bank_license"("bank_application_id");
CREATE INDEX "bank_license_org_id_idx"             ON "bank_license"("org_id");

CREATE TABLE "switching_toll" (
  "id"                TEXT NOT NULL,
  "session_ref"       TEXT NOT NULL,
  "session_type"      TEXT NOT NULL,
  "toll_type"         TEXT NOT NULL,
  "fee_minor"         BIGINT NOT NULL,
  "bank_code"         TEXT,
  "bank_name"         TEXT,
  "agent_id"          TEXT,
  "agent_state"       TEXT,
  "agent_lga"         TEXT,
  "ten_m_rule_applied" BOOLEAN NOT NULL DEFAULT FALSE,
  "amount_minor"      BIGINT,
  "org_id"            TEXT NOT NULL DEFAULT 'default',
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "switching_toll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "switching_toll_session_type_idx" ON "switching_toll"("session_type","created_at");
CREATE INDEX "switching_toll_toll_type_idx"    ON "switching_toll"("toll_type","created_at");
CREATE INDEX "switching_toll_bank_code_idx"    ON "switching_toll"("bank_code","created_at");
CREATE INDEX "switching_toll_agent_geo_idx"    ON "switching_toll"("agent_state","agent_lga");
CREATE INDEX "switching_toll_org_id_idx"       ON "switching_toll"("org_id","created_at");

CREATE TABLE "ajo_account" (
  "id"                       TEXT NOT NULL,
  "account_ref"              TEXT NOT NULL,
  "holder_name"              TEXT NOT NULL,
  "holder_bvn_masked"        TEXT NOT NULL,
  "bank_code"                TEXT NOT NULL,
  "bank_name"                TEXT NOT NULL,
  "cycle_start_date"         TIMESTAMP(3) NOT NULL,
  "cycle_length_days"        INTEGER NOT NULL DEFAULT 31,
  "status"                   TEXT NOT NULL,
  "day1_fee_minor"           BIGINT NOT NULL DEFAULT 50000,
  "day1_fee_status"          TEXT NOT NULL DEFAULT 'PENDING',
  "day1_fee_collected_at"    TIMESTAMP(3),
  "target_amount_minor"      BIGINT NOT NULL,
  "current_balance_minor"    BIGINT NOT NULL DEFAULT 0,
  "safe_break_penalty_minor" BIGINT,
  "org_id"                   TEXT NOT NULL DEFAULT 'default',
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ajo_account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ajo_account_ref_key"       ON "ajo_account"("account_ref");
CREATE INDEX "ajo_account_status_idx"           ON "ajo_account"("status","created_at");
CREATE INDEX "ajo_account_bank_code_idx"        ON "ajo_account"("bank_code");
CREATE INDEX "ajo_account_day1_fee_status_idx"  ON "ajo_account"("day1_fee_status");
CREATE INDEX "ajo_account_org_id_idx"           ON "ajo_account"("org_id","created_at");

CREATE TABLE "agent_liquidity_distribution" (
  "id"                    TEXT NOT NULL,
  "distribution_date"     TIMESTAMP(3) NOT NULL,
  "total_day1_fees_minor" BIGINT NOT NULL,
  "fman_share_minor"      BIGINT NOT NULL,
  "agent_pool_minor"      BIGINT NOT NULL,
  "two_percent_pool_minor" BIGINT NOT NULL,
  "reward_per_agent_minor" BIGINT NOT NULL,
  "total_agents_eligible" INTEGER NOT NULL,
  "status"                TEXT NOT NULL,
  "disbursed_at"          TIMESTAMP(3),
  "org_id"                TEXT NOT NULL DEFAULT 'default',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_liquidity_distribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_dist_date_idx"   ON "agent_liquidity_distribution"("distribution_date");
CREATE INDEX "agent_dist_status_idx" ON "agent_liquidity_distribution"("status");
CREATE INDEX "agent_dist_org_idx"    ON "agent_liquidity_distribution"("org_id");

CREATE TABLE "dedicated_account_balance" (
  "id"                        TEXT NOT NULL,
  "bank_application_id"       TEXT NOT NULL,
  "bank_name"                 TEXT NOT NULL,
  "bank_code"                 TEXT,
  "balance_minor"             BIGINT NOT NULL,
  "projected_payout_48h_minor" BIGINT NOT NULL,
  "red_flag_triggered"        BOOLEAN NOT NULL DEFAULT FALSE,
  "red_flag_triggered_at"     TIMESTAMP(3),
  "last_reconciled_at"        TIMESTAMP(3) NOT NULL,
  "org_id"                    TEXT NOT NULL DEFAULT 'default',
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dedicated_account_balance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "dedicated_acct_bank_app_key" ON "dedicated_account_balance"("bank_application_id");
CREATE INDEX "dedicated_acct_red_flag_idx"        ON "dedicated_account_balance"("red_flag_triggered");
CREATE INDEX "dedicated_acct_org_id_idx"          ON "dedicated_account_balance"("org_id");

CREATE TABLE "admin_red_flag" (
  "id"          TEXT NOT NULL,
  "flag_type"   TEXT NOT NULL,
  "severity"    TEXT NOT NULL,
  "bank_code"   TEXT,
  "bank_name"   TEXT,
  "message"     TEXT NOT NULL,
  "is_resolved" BOOLEAN NOT NULL DEFAULT FALSE,
  "resolved_at" TIMESTAMP(3),
  "resolved_by" TEXT,
  "org_id"      TEXT NOT NULL DEFAULT 'default',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_red_flag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_red_flag_resolved_idx"  ON "admin_red_flag"("is_resolved","created_at");
CREATE INDEX "admin_red_flag_type_idx"      ON "admin_red_flag"("flag_type");
CREATE INDEX "admin_red_flag_severity_idx"  ON "admin_red_flag"("severity");
CREATE INDEX "admin_red_flag_org_id_idx"    ON "admin_red_flag"("org_id");

