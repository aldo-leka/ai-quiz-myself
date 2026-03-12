ALTER TABLE "quizzes"
ADD COLUMN "estimated_tts_cost_usd_micros" integer,
ADD COLUMN "estimated_tts_cost_breakdown" jsonb;
