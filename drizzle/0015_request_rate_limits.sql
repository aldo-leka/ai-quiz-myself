CREATE TABLE "request_rate_limits" (
	"scope" text NOT NULL,
	"identifier" text NOT NULL,
	"window_start" timestamp NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "request_rate_limits_pk" PRIMARY KEY("scope","identifier","window_start")
);
--> statement-breakpoint
CREATE INDEX "request_rate_limits_updated_at_idx" ON "request_rate_limits" USING btree ("updated_at");
