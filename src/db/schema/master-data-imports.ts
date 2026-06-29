import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { paperMaterials } from "./paper-materials.ts";

export const masterDataImportBatches = pgTable(
  "master_data_import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    fileName: text("file_name").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    summary: jsonb("summary").notNull(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    confirmedBy: varchar("confirmed_by", { length: 100 }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    index("master_data_import_batches_status_created_at_idx").on(table.status, table.createdAt),
  ],
);

export const masterDataImportRows = pgTable(
  "master_data_import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => masterDataImportBatches.id),
    sheetName: text("sheet_name"),
    rowNumber: integer("row_number").notNull(),
    rowStatus: varchar("row_status", { length: 20 }).notNull(),
    rawData: jsonb("raw_data").notNull(),
    normalizedData: jsonb("normalized_data").notNull(),
    targetMaterialId: uuid("target_material_id").references(() => paperMaterials.id),
    candidateMaterialIds: jsonb("candidate_material_ids")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    changeSet: jsonb("change_set")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    errors: jsonb("errors")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("master_data_import_rows_batch_status_idx").on(table.batchId, table.rowStatus),
    index("master_data_import_rows_target_material_idx").on(table.targetMaterialId),
  ],
);

export const paperMaterialMatchRules = pgTable(
  "paper_material_match_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    sourceSignature: varchar("source_signature", { length: 255 }).notNull(),
    paperMaterialId: uuid("paper_material_id")
      .notNull()
      .references(() => paperMaterials.id),
    confirmedBy: varchar("confirmed_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("paper_material_match_rules_signature_unique").on(table.sourceSignature),
    index("paper_material_match_rules_material_idx").on(table.paperMaterialId),
  ],
);

export const masterDataChangeLogs = pgTable(
  "master_data_change_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    changeSource: varchar("change_source", { length: 20 }).notNull(),
    importBatchId: uuid("import_batch_id").references(() => masterDataImportBatches.id),
    changedFields: jsonb("changed_fields").notNull(),
    reason: text("reason"),
    changedBy: varchar("changed_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("master_data_change_logs_entity_created_at_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index("master_data_change_logs_import_batch_idx").on(table.importBatchId),
  ],
);
