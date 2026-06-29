import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const paperFactories = pgTable(
  "paper_factories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    contactName: varchar("contact_name", { length: 80 }),
    phone: varchar("phone", { length: 40 }),
    supplyTypes: jsonb("supply_types")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("paper_factories_name_unique").on(table.name)],
);
