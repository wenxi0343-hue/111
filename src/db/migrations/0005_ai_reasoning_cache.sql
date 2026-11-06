CREATE TABLE "ai_reasoning_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" varchar(128) NOT NULL,
	"reason_text" text NOT NULL,
	"model_name" varchar(100),
	"facts_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_reasoning_daily_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usage_date" varchar(10) NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reasoning_cache_key_unique" ON "ai_reasoning_cache" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "ai_reasoning_cache_expires_at_idx" ON "ai_reasoning_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reasoning_daily_usages_date_unique" ON "ai_reasoning_daily_usages" USING btree ("usage_date");
