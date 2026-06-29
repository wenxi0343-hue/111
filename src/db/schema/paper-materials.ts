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

import { paperFactories } from "./paper-factories.ts";

export const paperMaterials = pgTable(
  "paper_materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperCode: varchar("paper_code", { length: 60 }).notNull(),
    paperEncoding: varchar("paper_encoding", { length: 100 }),
    factoryId: uuid("factory_id")
      .notNull()
      .references(() => paperFactories.id),
    name: text("name").notNull(),
    paperKind: varchar("paper_kind", { length: 20 }).default("unknown").notNull(),
    grade: varchar("grade", { length: 80 }),
    gramWeightGsm: integer("gram_weight_gsm").notNull(),
    usage: varchar("usage", { length: 20 }),
    applicableFlutes: jsonb("applicable_flutes")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    priceYuanPerTon: numeric("price_yuan_per_ton", { precision: 12, scale: 2 }),
    burstIndex: numeric("burst_index", { precision: 10, scale: 4 }),
    ringCrushIndex: numeric("ring_crush_index", { precision: 10, scale: 4 }),
    completenessStatus: varchar("completeness_status", { length: 20 })
      .default("incomplete")
      .notNull(),
    missingFields: jsonb("missing_fields")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("paper_materials_paper_code_unique").on(table.paperCode),
    index("paper_materials_paper_encoding_idx").on(table.paperEncoding),
    index("paper_materials_factory_id_idx").on(table.factoryId),
    index("paper_materials_kind_status_active_idx").on(
      table.paperKind,
      table.completenessStatus,
      table.isActive,
    ),
  ],
);

export const paperMaterialPriceHistories = pgTable(
  "paper_material_price_histories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperMaterialId: uuid("paper_material_id")
      .notNull()
      .references(() => paperMaterials.id),
    priceYuanPerTon: numeric("price_yuan_per_ton", { precision: 12, scale: 2 }).notNull(),
    effectiveDate: date("effective_date"),
    sourceFileName: text("source_file_name").notNull(),
    sourceSheetName: text("source_sheet_name"),
    sourceRowNumber: integer("source_row_number"),
    importBatchId: uuid("import_batch_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("paper_material_price_histories_material_date_idx").on(
      table.paperMaterialId,
      table.effectiveDate,
    ),
    index("paper_material_price_histories_import_batch_idx").on(table.importBatchId),
  ],
);

export const paperQualityStandards = pgTable(
  "paper_quality_standards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperKind: varchar("paper_kind", { length: 20 }).notNull(),
    grade: varchar("grade", { length: 80 }),
    gramWeightMinGsm: integer("gram_weight_min_gsm"),
    gramWeightMaxGsm: integer("gram_weight_max_gsm"),
    burstIndex: numeric("burst_index", { precision: 10, scale: 4 }),
    ringCrushIndex: numeric("ring_crush_index", { precision: 10, scale: 4 }),
    rawLabel: text("raw_label").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    sourceSheetName: text("source_sheet_name").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("paper_quality_standards_lookup_idx").on(
      table.paperKind,
      table.grade,
      table.gramWeightMinGsm,
      table.gramWeightMaxGsm,
    ),
  ],
);
