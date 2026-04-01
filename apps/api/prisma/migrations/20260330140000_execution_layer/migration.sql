CREATE TABLE "internal_biometric_subject" (
    "id" TEXT NOT NULL,
    "public_subject_id" TEXT NOT NULL,
    "face_packed" BYTEA NOT NULL,
    "mobile_packed" BYTEA NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_biometric_subject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_biometric_subject_public_subject_id_key" ON "internal_biometric_subject"("public_subject_id");
CREATE INDEX "internal_biometric_subject_shard_region_idx" ON "internal_biometric_subject"("shard_region");

CREATE TABLE "internal_fingerprint_slot" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "fingerprint_packed" BYTEA NOT NULL,

    CONSTRAINT "internal_fingerprint_slot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "internal_fingerprint_slot_subject_id_slot_index_key" ON "internal_fingerprint_slot"("subject_id", "slot_index");
CREATE INDEX "internal_fingerprint_slot_subject_id_idx" ON "internal_fingerprint_slot"("subject_id");

ALTER TABLE "internal_fingerprint_slot" ADD CONSTRAINT "internal_fingerprint_slot_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "internal_biometric_subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ledger_account" (
    "id" TEXT NOT NULL,
    "public_ref" TEXT NOT NULL,
    "owner_bvn_hash" TEXT,
    "owner_internal_subject_id" TEXT,
    "currency_code" TEXT NOT NULL,
    "balance_minor" DECIMAL(24,0) NOT NULL DEFAULT 0,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_account_public_ref_key" ON "ledger_account"("public_ref");
CREATE INDEX "ledger_account_owner_bvn_hash_idx" ON "ledger_account"("owner_bvn_hash");
CREATE INDEX "ledger_account_owner_internal_subject_id_idx" ON "ledger_account"("owner_internal_subject_id");
CREATE INDEX "ledger_account_shard_region_idx" ON "ledger_account"("shard_region");

ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_owner_internal_subject_id_fkey" FOREIGN KEY ("owner_internal_subject_id") REFERENCES "internal_biometric_subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ledger_transfer" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "debit_account_id" TEXT NOT NULL,
    "credit_account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "narrative" TEXT,
    "biometric_audit_json" TEXT NOT NULL,
    "execution_status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_transfer_idempotency_key_key" ON "ledger_transfer"("idempotency_key");
CREATE INDEX "ledger_transfer_debit_account_id_idx" ON "ledger_transfer"("debit_account_id");
CREATE INDEX "ledger_transfer_created_at_idx" ON "ledger_transfer"("created_at");

ALTER TABLE "ledger_transfer" ADD CONSTRAINT "ledger_transfer_debit_account_id_fkey" FOREIGN KEY ("debit_account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_transfer" ADD CONSTRAINT "ledger_transfer_credit_account_id_fkey" FOREIGN KEY ("credit_account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "withdrawal_authorization" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "biometric_audit_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_authorization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_authorization_token_key" ON "withdrawal_authorization"("token");
CREATE INDEX "withdrawal_authorization_account_id_idx" ON "withdrawal_authorization"("account_id");

ALTER TABLE "withdrawal_authorization" ADD CONSTRAINT "withdrawal_authorization_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "bill_payment" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "account_id" TEXT NOT NULL,
    "amount_minor" DECIMAL(24,0) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "vcap_reference" TEXT NOT NULL,
    "utility_code" TEXT NOT NULL,
    "biometric_audit_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "org_id" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bill_payment_idempotency_key_key" ON "bill_payment"("idempotency_key");
CREATE INDEX "bill_payment_account_id_idx" ON "bill_payment"("account_id");

ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "pulse_sync_queue" (
    "id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "shard_region" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "pulse_sync_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pulse_sync_queue_status_idx" ON "pulse_sync_queue"("status");
CREATE INDEX "pulse_sync_queue_reference_idx" ON "pulse_sync_queue"("reference_type", "reference_id");
