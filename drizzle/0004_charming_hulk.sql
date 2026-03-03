CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "is_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "flag_reason" text;--> statement-breakpoint
CREATE INDEX "platform_settings_key_idx" ON "platform_settings" USING btree ("key");--> statement-breakpoint
CREATE INDEX "quizzes_is_flagged_idx" ON "quizzes" USING btree ("is_flagged");
--> statement-breakpoint
INSERT INTO "platform_settings" ("key", "value", "description")
VALUES ('credit_cost_ai_generation', '1', 'Credits required for AI quiz generation')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "platform_settings" ("key", "value", "description")
VALUES ('credit_cost_pdf_generation', '1', 'Credits required for PDF quiz generation')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "platform_settings" ("key", "value", "description")
VALUES ('credit_cost_url_generation', '1', 'Credits required for URL quiz generation')
ON CONFLICT ("key") DO NOTHING;
