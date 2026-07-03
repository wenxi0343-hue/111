CREATE TABLE "historical_order_habit_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid,
	"dimension_type" varchar(40) NOT NULL,
	"dimension_key" varchar(120) NOT NULL,
	"layer_count" integer,
	"flute" varchar(20),
	"factory_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gram_weights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order_count" integer NOT NULL,
	"frequency" numeric(8, 4) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_order_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"size_bucket_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"confirmed_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "historical_order_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"sheet_name" text,
	"row_number" integer NOT NULL,
	"row_status" varchar(20) NOT NULL,
	"raw_data" jsonb NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"paper_code_match_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matched_material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidate_material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historical_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"import_row_id" uuid NOT NULL,
	"order_date" date NOT NULL,
	"product_name" text NOT NULL,
	"product_category" text,
	"length_mm" integer NOT NULL,
	"width_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"quantity" integer NOT NULL,
	"weight_kg" numeric(10, 2),
	"raw_paper_code" text NOT NULL,
	"parsed_layer_count" integer,
	"parsed_flute" varchar(20),
	"matched_material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"paper_code_status" varchar(40) NOT NULL,
	"exception_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_statistical" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "historical_order_habit_summaries" ADD CONSTRAINT "historical_order_habit_summaries_import_batch_id_historical_order_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."historical_order_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_order_import_rows" ADD CONSTRAINT "historical_order_import_rows_batch_id_historical_order_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."historical_order_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_import_batch_id_historical_order_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."historical_order_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historical_orders" ADD CONSTRAINT "historical_orders_import_row_id_historical_order_import_rows_id_fk" FOREIGN KEY ("import_row_id") REFERENCES "public"."historical_order_import_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historical_order_habit_summaries_dimension_idx" ON "historical_order_habit_summaries" USING btree ("dimension_type","dimension_key","order_count");--> statement-breakpoint
CREATE INDEX "historical_order_import_batches_status_created_at_idx" ON "historical_order_import_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "historical_order_import_rows_batch_status_idx" ON "historical_order_import_rows" USING btree ("batch_id","row_status");--> statement-breakpoint
CREATE UNIQUE INDEX "historical_orders_import_row_unique" ON "historical_orders" USING btree ("import_row_id");--> statement-breakpoint
CREATE INDEX "historical_orders_statistical_date_idx" ON "historical_orders" USING btree ("is_statistical","order_date");--> statement-breakpoint
CREATE INDEX "historical_orders_product_size_weight_idx" ON "historical_orders" USING btree ("product_name","length_mm","width_mm","height_mm","weight_kg");