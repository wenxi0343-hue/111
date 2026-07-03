import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const historicalOrderImportBatches = pgTable(
  "historical_order_import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileName: text("file_name").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    summary: jsonb("summary")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    sizeBucketConfig: jsonb("size_bucket_config")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    confirmedBy: varchar("confirmed_by", { length: 100 }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    index("historical_order_import_batches_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const historicalOrderImportRows = pgTable(
  "historical_order_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => historicalOrderImportBatches.id),
    sheetName: text("sheet_name"),
    rowNumber: integer("row_number").notNull(),
    rowStatus: varchar("row_status", { length: 20 }).notNull(),
    rawData: jsonb("raw_data").notNull(),
    normalizedData: jsonb("normalized_data").notNull(),
    paperCodeMatchResult: jsonb("paper_code_match_result")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    matchedMaterialIds: jsonb("matched_material_ids")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    candidateMaterialIds: jsonb("candidate_material_ids")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    errors: jsonb("errors")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("historical_order_import_rows_batch_status_idx").on(table.batchId, table.rowStatus),
  ],
);

export const historicalOrders = pgTable(
  "historical_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => historicalOrderImportBatches.id),
    importRowId: uuid("import_row_id")
      .notNull()
      .references(() => historicalOrderImportRows.id),
    orderDate: date("order_date").notNull(),
    productName: text("product_name").notNull(),
    productCategory: text("product_category"),
    lengthMm: integer("length_mm").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
    quantity: integer("quantity").notNull(),
    weightKg: numeric("weight_kg", { precision: 10, scale: 2 }),
    rawPaperCode: text("raw_paper_code").notNull(),
    parsedLayerCount: integer("parsed_layer_count"),
    parsedFlute: varchar("parsed_flute", { length: 20 }),
    matchedMaterialIds: jsonb("matched_material_ids")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    paperCodeStatus: varchar("paper_code_status", { length: 40 }).notNull(),
    exceptionReasons: jsonb("exception_reasons")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    isStatistical: boolean("is_statistical").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("historical_orders_import_row_unique").on(table.importRowId),
    index("historical_orders_batch_statistical_idx").on(table.importBatchId, table.isStatistical),
    index("historical_orders_statistical_date_idx").on(table.isStatistical, table.orderDate),
    index("historical_orders_product_size_weight_idx").on(
      table.productName,
      table.lengthMm,
      table.widthMm,
      table.heightMm,
      table.weightKg,
    ),
  ],
);

export const historicalOrderHabitSummaries = pgTable(
  "historical_order_habit_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importBatchId: uuid("import_batch_id").references(() => historicalOrderImportBatches.id),
    dimensionType: varchar("dimension_type", { length: 40 }).notNull(),
    dimensionKey: varchar("dimension_key", { length: 120 }).notNull(),
    layerCount: integer("layer_count"),
    flute: varchar("flute", { length: 20 }),
    factoryNames: jsonb("factory_names")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    gramWeights: jsonb("gram_weights")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    orderCount: integer("order_count").notNull(),
    frequency: numeric("frequency", { precision: 8, scale: 4 }).notNull(),
    generatedAt: timestamp("generated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("historical_order_habit_summaries_batch_dimension_idx").on(
      table.importBatchId,
      table.dimensionType,
      table.dimensionKey,
      table.orderCount,
    ),
    index("historical_order_habit_summaries_dimension_idx").on(
      table.dimensionType,
      table.dimensionKey,
      table.orderCount,
    ),
  ],
);
