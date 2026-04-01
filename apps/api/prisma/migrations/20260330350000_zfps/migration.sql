-- ZFPS: Zero-Friction Provisioning Stack
-- Migration: 20260330350000_zfps

CREATE TABLE "bank_api_latency_log" (
  "id"              TEXT NOT NULL,
  "bank_code"       TEXT NOT NULL,
  "bank_name"       TEXT NOT NULL,
  "session_ref"     TEXT NOT NULL,
  "operation_type"  TEXT NOT NULL,
  "latency_ms"      INTEGER NOT NULL,
  "status_code"     INTEGER,
  "succeeded"       BOOLEAN NOT NULL,
  "alert_triggered" BOOLEAN NOT NULL DEFAULT FALSE,
  "org_id"          TEXT NOT NULL DEFAULT 'default',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_api_latency_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bal_bank_code_idx"      ON "bank_api_latency_log"("bank_code","created_at");
CREATE INDEX "bal_latency_ms_idx"     ON "bank_api_latency_log"("latency_ms");
CREATE INDEX "bal_alert_idx"          ON "bank_api_latency_log"("alert_triggered");
CREATE INDEX "bal_org_id_idx"         ON "bank_api_latency_log"("org_id","created_at");

CREATE TABLE "zfps_provisioning_event" (
  "id"                     TEXT NOT NULL,
  "session_ref"            TEXT NOT NULL,
  "bank_code"              TEXT NOT NULL,
  "bank_name"              TEXT NOT NULL,
  "account_type"           TEXT NOT NULL,
  "nibss_match_id"         TEXT NOT NULL,
  "iso20022_msg_id"        TEXT NOT NULL,
  "vault_opened_at"        TIMESTAMP(3) NOT NULL,
  "vault_closed_at"        TIMESTAMP(3),
  "cbs_latency_ms"         INTEGER,
  "account_number_masked"  TEXT,
  "status"                 TEXT NOT NULL,
  "sms_sent_at"            TIMESTAMP(3),
  "sms_delivered"          BOOLEAN,
  "sms_provider"           TEXT,
  "mandate_met"            BOOLEAN,
  "org_id"                 TEXT NOT NULL DEFAULT 'default',
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at"           TIMESTAMP(3),
  CONSTRAINT "zfps_provisioning_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zfps_event_session_ref_key" ON "zfps_provisioning_event"("session_ref");
CREATE INDEX "zfps_event_status_idx"   ON "zfps_provisioning_event"("status","created_at");
CREATE INDEX "zfps_event_bank_idx"     ON "zfps_provisioning_event"("bank_code","created_at");
CREATE INDEX "zfps_event_nibss_idx"    ON "zfps_provisioning_event"("nibss_match_id");
CREATE INDEX "zfps_event_org_idx"      ON "zfps_provisioning_event"("org_id","created_at");

CREATE TABLE "sms_send_log" (
  "id"              TEXT NOT NULL,
  "recipient"       TEXT NOT NULL,
  "message_type"    TEXT NOT NULL,
  "session_ref"     TEXT,
  "provider"        TEXT NOT NULL,
  "message_body"    TEXT NOT NULL,
  "provider_msg_id" TEXT,
  "status"          TEXT NOT NULL,
  "sent_at"         TIMESTAMP(3),
  "org_id"          TEXT NOT NULL DEFAULT 'default',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_send_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_recipient_idx"   ON "sms_send_log"("recipient");
CREATE INDEX "sms_status_idx"      ON "sms_send_log"("status","created_at");
CREATE INDEX "sms_session_ref_idx" ON "sms_send_log"("session_ref");
CREATE INDEX "sms_org_id_idx"      ON "sms_send_log"("org_id","created_at");

