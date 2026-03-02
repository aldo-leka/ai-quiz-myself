CREATE TYPE "public"."quiz_vote" AS ENUM('like', 'dislike');--> statement-breakpoint
CREATE TABLE "quiz_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"user_id" text,
	"anon_id" text,
	"vote" "quiz_vote" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quiz_votes_actor_check" CHECK ((("user_id" is not null and "anon_id" is null) or ("user_id" is null and "anon_id" is not null)))
);
--> statement-breakpoint
ALTER TABLE "quiz_votes" ADD CONSTRAINT "quiz_votes_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_votes" ADD CONSTRAINT "quiz_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_votes_quiz_id_idx" ON "quiz_votes" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_votes_user_id_idx" ON "quiz_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_votes_anon_id_idx" ON "quiz_votes" USING btree ("anon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_votes_quiz_user_uq" ON "quiz_votes" USING btree ("quiz_id","user_id") WHERE "quiz_votes"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_votes_quiz_anon_uq" ON "quiz_votes" USING btree ("quiz_id","anon_id") WHERE "quiz_votes"."anon_id" is not null;