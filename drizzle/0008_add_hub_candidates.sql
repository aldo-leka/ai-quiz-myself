DO $$
BEGIN
  CREATE TYPE "public"."hub_candidate_status" AS ENUM('pending', 'processing', 'approved', 'rejected', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "public"."hub_candidate_decision" AS ENUM('approve', 'reject_niche', 'reject_polarizing', 'reject_unsafe');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "hub_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_quiz_id" uuid,
  "submitted_by_user_id" text,
  "title" text NOT NULL,
  "theme" text NOT NULL,
  "language" text DEFAULT 'en' NOT NULL,
  "difficulty" "quiz_difficulty" NOT NULL,
  "game_mode" "quiz_game_mode" NOT NULL,
  "source_type" "quiz_source_type" NOT NULL,
  "source_url" text,
  "question_count" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "status" "hub_candidate_status" DEFAULT 'pending' NOT NULL,
  "decision" "hub_candidate_decision",
  "review_reason" text,
  "published_quiz_id" uuid,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "hub_candidates"
    ADD CONSTRAINT "hub_candidates_source_quiz_id_quizzes_id_fk"
    FOREIGN KEY ("source_quiz_id")
    REFERENCES "public"."quizzes"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "hub_candidates"
    ADD CONSTRAINT "hub_candidates_submitted_by_user_id_user_id_fk"
    FOREIGN KEY ("submitted_by_user_id")
    REFERENCES "public"."user"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "hub_candidates"
    ADD CONSTRAINT "hub_candidates_published_quiz_id_quizzes_id_fk"
    FOREIGN KEY ("published_quiz_id")
    REFERENCES "public"."quizzes"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS "hub_candidates_source_quiz_id_idx" ON "hub_candidates" USING btree ("source_quiz_id");
CREATE INDEX IF NOT EXISTS "hub_candidates_submitted_by_user_id_idx" ON "hub_candidates" USING btree ("submitted_by_user_id");
CREATE INDEX IF NOT EXISTS "hub_candidates_status_idx" ON "hub_candidates" USING btree ("status");
CREATE INDEX IF NOT EXISTS "hub_candidates_decision_idx" ON "hub_candidates" USING btree ("decision");
CREATE INDEX IF NOT EXISTS "hub_candidates_created_at_idx" ON "hub_candidates" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "hub_candidates_published_quiz_id_idx" ON "hub_candidates" USING btree ("published_quiz_id");

DROP INDEX IF EXISTS "quizzes_is_flagged_idx";

ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "hub_status";
ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "is_flagged";
ALTER TABLE "quizzes" DROP COLUMN IF EXISTS "flag_reason";

DROP TYPE IF EXISTS "public"."quiz_hub_status";
