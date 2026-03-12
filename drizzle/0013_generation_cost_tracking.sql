ALTER TABLE "quizzes"
  ADD COLUMN "generation_cost_usd_micros" integer,
  ADD COLUMN "generation_cost_breakdown" jsonb NOT NULL DEFAULT '{"currency":"USD","totalUsdMicros":0,"hasUnpricedLineItems":false,"lineItems":[]}'::jsonb;

ALTER TABLE "quiz_generation_jobs"
  ADD COLUMN "generation_cost_usd_micros" integer,
  ADD COLUMN "generation_cost_breakdown" jsonb NOT NULL DEFAULT '{"currency":"USD","totalUsdMicros":0,"hasUnpricedLineItems":false,"lineItems":[]}'::jsonb;
