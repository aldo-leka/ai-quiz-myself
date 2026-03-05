ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_payment_method_id" text,
  ADD COLUMN IF NOT EXISTS "starter_credits_granted" boolean DEFAULT false NOT NULL;

DO $$
BEGIN
  ALTER TYPE "credit_transaction_type" ADD VALUE IF NOT EXISTS 'auto_reload';
  ALTER TYPE "credit_transaction_type" ADD VALUE IF NOT EXISTS 'starter_bonus';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "credit_transaction_status" AS ENUM ('pending', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credits'
      AND column_name = 'balance'
  ) THEN
    ALTER TABLE "credits" RENAME COLUMN "balance" TO "balance_cents";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'credit_transactions'
      AND column_name = 'amount'
  ) THEN
    ALTER TABLE "credit_transactions" RENAME COLUMN "amount" TO "amount_cents";
  END IF;
END
$$;

ALTER TABLE "credits"
  ALTER COLUMN "balance_cents" SET DEFAULT 0;

DROP INDEX IF EXISTS "credits_balance_idx";
CREATE INDEX IF NOT EXISTS "credits_balance_cents_idx" ON "credits" USING btree ("balance_cents");

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'usd' NOT NULL,
  ADD COLUMN IF NOT EXISTS "status" "credit_transaction_status" DEFAULT 'completed' NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_order_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_checkout_id" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

CREATE INDEX IF NOT EXISTS "credit_transactions_status_idx"
  ON "credit_transactions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "credit_transactions_stripe_order_id_idx"
  ON "credit_transactions" USING btree ("stripe_order_id");
CREATE INDEX IF NOT EXISTS "credit_transactions_stripe_checkout_id_idx"
  ON "credit_transactions" USING btree ("stripe_checkout_id");

CREATE TABLE IF NOT EXISTS "auto_recharge_settings" (
  "user_id" text PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "threshold_cents" integer DEFAULT 500 NOT NULL,
  "target_cents" integer DEFAULT 1000 NOT NULL,
  "monthly_cap_cents" integer,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auto_recharge_settings_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "auto_recharge_settings"
      ADD CONSTRAINT "auto_recharge_settings_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "auto_recharge_settings_enabled_idx"
  ON "auto_recharge_settings" USING btree ("enabled");

CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text DEFAULT 'stripe' NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_events_provider_event_id_uq"
  ON "billing_webhook_events" USING btree ("provider", "event_id");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_event_type_idx"
  ON "billing_webhook_events" USING btree ("event_type");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_created_at_idx"
  ON "billing_webhook_events" USING btree ("created_at");
