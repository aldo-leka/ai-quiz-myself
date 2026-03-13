ALTER TABLE "quiz_sessions"
ADD COLUMN "anon_id" text;

CREATE INDEX "quiz_sessions_anon_id_idx" ON "quiz_sessions" USING btree ("anon_id");

ALTER TABLE "quiz_sessions"
ADD CONSTRAINT "quiz_sessions_actor_check"
CHECK ((("user_id" is not null and "anon_id" is null) or ("user_id" is null and "anon_id" is not null)));
