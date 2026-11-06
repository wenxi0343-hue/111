CREATE TABLE "review_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(40) NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"product_name" varchar(160) NOT NULL,
	"salesperson" varchar(100) NOT NULL,
	"has_sample" boolean DEFAULT false NOT NULL,
	"sample_notes" text,
	"expected_test_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"box_spec_snapshot" jsonb NOT NULL,
	"requested_layer_count" integer,
	"printing_requirements" text,
	"physical_requirements" text,
	"status" varchar(30) DEFAULT 'pending_process_review' NOT NULL,
	"process_review_snapshot" jsonb,
	"finance_quote_snapshot" jsonb,
	"created_by" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "review_orders_order_no_unique" ON "review_orders" USING btree ("order_no");
--> statement-breakpoint
CREATE INDEX "review_orders_status_idx" ON "review_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "review_orders_salesperson_created_at_idx" ON "review_orders" USING btree ("salesperson","created_at");
--> statement-breakpoint
CREATE INDEX "review_orders_created_at_idx" ON "review_orders" USING btree ("created_at");
