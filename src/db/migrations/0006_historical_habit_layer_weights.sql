ALTER TABLE "historical_order_habit_summaries" ADD COLUMN "layer_paper_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "historical_order_habit_summaries" ADD COLUMN "layer_gram_weights" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "historical_order_habit_summaries" ADD COLUMN "total_gram_weight" integer;
