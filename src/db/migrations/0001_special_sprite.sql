CREATE TABLE "master_data_change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid NOT NULL,
	"change_source" varchar(20) NOT NULL,
	"import_batch_id" uuid,
	"changed_fields" jsonb NOT NULL,
	"reason" text,
	"changed_by" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_data_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"file_name" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"summary" jsonb NOT NULL,
	"created_by" varchar(100) NOT NULL,
	"confirmed_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "master_data_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"sheet_name" text,
	"row_number" integer NOT NULL,
	"row_status" varchar(20) NOT NULL,
	"raw_data" jsonb NOT NULL,
	"normalized_data" jsonb NOT NULL,
	"target_material_id" uuid,
	"candidate_material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"change_set" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_factories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"contact_name" varchar(80),
	"phone" varchar(40),
	"supply_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_material_match_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"source_signature" varchar(255) NOT NULL,
	"paper_material_id" uuid NOT NULL,
	"confirmed_by" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_material_price_histories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_material_id" uuid NOT NULL,
	"price_yuan_per_ton" numeric(12, 2) NOT NULL,
	"effective_date" date,
	"source_file_name" text NOT NULL,
	"source_sheet_name" text,
	"source_row_number" integer,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_code" varchar(60) NOT NULL,
	"paper_encoding" varchar(100),
	"factory_id" uuid NOT NULL,
	"name" text NOT NULL,
	"paper_kind" varchar(20) DEFAULT 'unknown' NOT NULL,
	"grade" varchar(80),
	"gram_weight_gsm" integer NOT NULL,
	"usage" varchar(20),
	"applicable_flutes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_yuan_per_ton" numeric(12, 2),
	"burst_index" numeric(10, 4),
	"ring_crush_index" numeric(10, 4),
	"completeness_status" varchar(20) DEFAULT 'incomplete' NOT NULL,
	"missing_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_quality_standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_kind" varchar(20) NOT NULL,
	"grade" varchar(80),
	"gram_weight_min_gsm" integer,
	"gram_weight_max_gsm" integer,
	"burst_index" numeric(10, 4),
	"ring_crush_index" numeric(10, 4),
	"raw_label" text NOT NULL,
	"source_file_name" text NOT NULL,
	"source_sheet_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_data_change_logs" ADD CONSTRAINT "master_data_change_logs_import_batch_id_master_data_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."master_data_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_import_rows" ADD CONSTRAINT "master_data_import_rows_batch_id_master_data_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."master_data_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_data_import_rows" ADD CONSTRAINT "master_data_import_rows_target_material_id_paper_materials_id_fk" FOREIGN KEY ("target_material_id") REFERENCES "public"."paper_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_material_match_rules" ADD CONSTRAINT "paper_material_match_rules_paper_material_id_paper_materials_id_fk" FOREIGN KEY ("paper_material_id") REFERENCES "public"."paper_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_material_price_histories" ADD CONSTRAINT "paper_material_price_histories_paper_material_id_paper_materials_id_fk" FOREIGN KEY ("paper_material_id") REFERENCES "public"."paper_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_materials" ADD CONSTRAINT "paper_materials_factory_id_paper_factories_id_fk" FOREIGN KEY ("factory_id") REFERENCES "public"."paper_factories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_data_change_logs_entity_created_at_idx" ON "master_data_change_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "master_data_change_logs_import_batch_idx" ON "master_data_change_logs" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "master_data_import_batches_status_created_at_idx" ON "master_data_import_batches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "master_data_import_rows_batch_status_idx" ON "master_data_import_rows" USING btree ("batch_id","row_status");--> statement-breakpoint
CREATE INDEX "master_data_import_rows_target_material_idx" ON "master_data_import_rows" USING btree ("target_material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_factories_name_unique" ON "paper_factories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_material_match_rules_signature_unique" ON "paper_material_match_rules" USING btree ("source_signature");--> statement-breakpoint
CREATE INDEX "paper_material_match_rules_material_idx" ON "paper_material_match_rules" USING btree ("paper_material_id");--> statement-breakpoint
CREATE INDEX "paper_material_price_histories_material_date_idx" ON "paper_material_price_histories" USING btree ("paper_material_id","effective_date");--> statement-breakpoint
CREATE INDEX "paper_material_price_histories_import_batch_idx" ON "paper_material_price_histories" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "paper_materials_paper_code_unique" ON "paper_materials" USING btree ("paper_code");--> statement-breakpoint
CREATE INDEX "paper_materials_paper_encoding_idx" ON "paper_materials" USING btree ("paper_encoding");--> statement-breakpoint
CREATE INDEX "paper_materials_factory_id_idx" ON "paper_materials" USING btree ("factory_id");--> statement-breakpoint
CREATE INDEX "paper_materials_kind_status_active_idx" ON "paper_materials" USING btree ("paper_kind","completeness_status","is_active");--> statement-breakpoint
CREATE INDEX "paper_quality_standards_lookup_idx" ON "paper_quality_standards" USING btree ("paper_kind","grade","gram_weight_min_gsm","gram_weight_max_gsm");