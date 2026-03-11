ALTER TABLE "quizzes"
ADD COLUMN IF NOT EXISTS "generation_provider" "api_key_provider";

ALTER TABLE "quizzes"
ADD COLUMN IF NOT EXISTS "generation_model" text;
