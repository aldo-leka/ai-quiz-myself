CREATE TABLE "user_quiz_random_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"quiz_id" uuid NOT NULL,
	"game_mode_filter" text DEFAULT 'all' NOT NULL,
	"language_filter" text DEFAULT 'all' NOT NULL,
	"serve_count" integer DEFAULT 0 NOT NULL,
	"last_served_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_quiz_random_history" ADD CONSTRAINT "user_quiz_random_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_quiz_random_history" ADD CONSTRAINT "user_quiz_random_history_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_quiz_random_history_scope_quiz_uq" ON "user_quiz_random_history" USING btree ("user_id","game_mode_filter","language_filter","quiz_id");
--> statement-breakpoint
CREATE INDEX "user_quiz_random_history_scope_served_idx" ON "user_quiz_random_history" USING btree ("user_id","game_mode_filter","language_filter","last_served_at");
--> statement-breakpoint
CREATE INDEX "user_quiz_random_history_quiz_id_idx" ON "user_quiz_random_history" USING btree ("quiz_id");
