import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const matchingSchemes = pgTable(
  "matching_schemes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    boxSpecSnapshot: jsonb("box_spec_snapshot").notNull(),
    originalRecommendationSlotsSnapshot: jsonb("original_recommendation_slots_snapshot")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    finalSchemeSnapshot: jsonb("final_scheme_snapshot").notNull(),
    priceSnapshot: jsonb("price_snapshot").notNull(),
    parameterVersion: varchar("parameter_version", { length: 80 }).notNull(),
    isManuallyAdjusted: boolean("is_manually_adjusted").default(false).notNull(),
    exportRecords: jsonb("export_records")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    confirmedBy: varchar("confirmed_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("matching_schemes_created_at_idx").on(table.createdAt),
    index("matching_schemes_confirmed_by_created_at_idx").on(table.confirmedBy, table.createdAt),
  ],
);
