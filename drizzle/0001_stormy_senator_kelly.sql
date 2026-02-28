CREATE TYPE "public"."api_key_provider" AS ENUM('openai', 'anthropic', 'google');--> statement-breakpoint
CREATE TYPE "public"."quiz_difficulty" AS ENUM('easy', 'medium', 'hard', 'mixed', 'escalating');--> statement-breakpoint
CREATE TYPE "public"."quiz_game_mode" AS ENUM('single', 'wwtbam', 'couch_coop');--> statement-breakpoint
CREATE TYPE "public"."quiz_source_type" AS ENUM('ai_generated', 'pdf', 'url', 'manual');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "api_key_provider" NOT NULL,
	"encrypted_key" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_text" text NOT NULL,
	"image_url" text,
	"options" jsonb NOT NULL,
	"correct_option_index" integer NOT NULL,
	"difficulty" "quiz_difficulty" NOT NULL,
	"subject" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_session_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_index" integer,
	"is_correct" boolean NOT NULL,
	"time_taken_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" text,
	"game_mode" "quiz_game_mode" NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" text,
	"title" text NOT NULL,
	"theme" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"difficulty" "quiz_difficulty" NOT NULL,
	"game_mode" "quiz_game_mode" NOT NULL,
	"question_count" integer NOT NULL,
	"source_type" "quiz_source_type" NOT NULL,
	"is_hub" boolean DEFAULT false NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"dislikes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_session_answers" ADD CONSTRAINT "quiz_session_answers_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_session_answers" ADD CONSTRAINT "quiz_session_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_user_provider_uq" ON "api_keys" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "questions_quiz_id_idx" ON "questions" USING btree ("quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_quiz_id_position_uq" ON "questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "quiz_session_answers_session_id_idx" ON "quiz_session_answers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "quiz_session_answers_question_id_idx" ON "quiz_session_answers" USING btree ("question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_session_answers_session_question_uq" ON "quiz_session_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "quiz_sessions_quiz_id_idx" ON "quiz_sessions" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_sessions_user_id_idx" ON "quiz_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_sessions_started_at_idx" ON "quiz_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "quizzes_creator_id_idx" ON "quizzes" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "quizzes_game_mode_idx" ON "quizzes" USING btree ("game_mode");--> statement-breakpoint
CREATE INDEX "quizzes_is_hub_idx" ON "quizzes" USING btree ("is_hub");--> statement-breakpoint
CREATE INDEX "quizzes_hub_mode_idx" ON "quizzes" USING btree ("is_hub","game_mode");