CREATE TABLE "matching_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_spec_snapshot" jsonb NOT NULL,
	"original_recommendation_slots_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_scheme_snapshot" jsonb NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	"parameter_version" varchar(80) NOT NULL,
	"is_manually_adjusted" boolean DEFAULT false NOT NULL,
	"export_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirmed_by" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "matching_schemes_created_at_idx" ON "matching_schemes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "matching_schemes_confirmed_by_created_at_idx" ON "matching_schemes" USING btree ("confirmed_by","created_at");