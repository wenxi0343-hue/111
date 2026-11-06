import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const aiReasoningCache = pgTable(
  "ai_reasoning_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cacheKey: varchar("cache_key", { length: 128 }).notNull(),
    reasonText: text("reason_text").notNull(),
    modelName: varchar("model_name", { length: 100 }),
    factsSnapshot: jsonb("facts_snapshot").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("ai_reasoning_cache_key_unique").on(table.cacheKey),
    index("ai_reasoning_cache_expires_at_idx").on(table.expiresAt),
  ],
);

export const aiReasoningDailyUsages = pgTable(
  "ai_reasoning_daily_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    usageDate: varchar("usage_date", { length: 10 }).notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ai_reasoning_daily_usages_date_unique").on(table.usageDate),
  ],
);
