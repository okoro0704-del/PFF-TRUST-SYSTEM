CREATE TABLE "pos_terminal" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "agent_bvn_hash" TEXT NOT NULL,
    "lock_state" TEXT NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "consecutive_failed_unlocks" INTEGER NOT NULL DEFAULT 0,
    "last_daily_lock_at" TIMESTAMP(3),
    "stealth_capture_at" TIMESTAMP(3),
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_terminal_terminal_id_key" ON "pos_terminal"("terminal_id");
CREATE INDEX "pos_terminal_org_id_idx" ON "pos_terminal"("org_id");
CREATE INDEX "pos_terminal_agent_bvn_hash_idx" ON "pos_terminal"("agent_bvn_hash");

CREATE TABLE "terminal_tcp_ledger" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "event_type" TEXT NOT NULL,
    "payload_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_tcp_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_tcp_ledger_terminal_id_created_at_idx" ON "terminal_tcp_ledger"("terminal_id", "created_at");
CREATE INDEX "terminal_tcp_ledger_org_id_created_at_idx" ON "terminal_tcp_ledger"("org_id", "created_at");

ALTER TABLE "terminal_tcp_ledger" ENABLE ROW LEVEL SECURITY;

CREATE POLICY terminal_tcp_ledger_org_select ON "terminal_tcp_ledger"
  FOR SELECT
  USING (org_id = current_setting('app.current_org_id', true));

CREATE POLICY terminal_tcp_ledger_org_insert ON "terminal_tcp_ledger"
  FOR INSERT
  WITH CHECK (org_id = current_setting('app.current_org_id', true));
