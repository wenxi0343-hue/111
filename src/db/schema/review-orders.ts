import { sql } from "drizzle-orm";
import {
  boolean,
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

export const REVIEW_ORDER_STATUSES = [
  "pending_process_review",
  "pending_finance_review",
  "quoted",
] as const;
export type ReviewOrderStatus = (typeof REVIEW_ORDER_STATUSES)[number];

export const reviewOrders = pgTable(
  "review_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNo: varchar("order_no", { length: 40 }).notNull(),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    productName: varchar("product_name", { length: 160 }).notNull(),
    salesperson: varchar("salesperson", { length: 100 }).notNull(),
    hasSample: boolean("has_sample").default(false).notNull(),
    sampleNotes: text("sample_notes"),
    expectedTestItems: jsonb("expected_test_items")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    boxSpecSnapshot: jsonb("box_spec_snapshot").notNull(),
    requestedLayerCount: integer("requested_layer_count"),
    printingRequirements: text("printing_requirements"),
    physicalRequirements: text("physical_requirements"),
    status: varchar("status", { length: 30 }).default("pending_process_review").notNull(),
    processReviewSnapshot: jsonb("process_review_snapshot"),
    financeQuoteSnapshot: jsonb("finance_quote_snapshot"),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("review_orders_order_no_unique").on(table.orderNo),
    index("review_orders_status_idx").on(table.status),
    index("review_orders_salesperson_created_at_idx").on(table.salesperson, table.createdAt),
    index("review_orders_created_at_idx").on(table.createdAt),
  ],
);
