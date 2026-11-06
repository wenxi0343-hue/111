import { desc } from "drizzle-orm";
import type { DrizzleDatabase } from "@/db";
import { reviewOrders } from "@/db/schema/review-orders";

export interface InsertReviewOrderRow {
  orderNo: string;
  customerName: string;
  productName: string;
  salesperson: string;
  hasSample: boolean;
  sampleNotes: string | null;
  expectedTestItems: string[];
  boxSpecSnapshot: Record<string, unknown>;
  requestedLayerCount: number | null;
  printingRequirements: string | null;
  physicalRequirements: string | null;
  createdBy: string;
}

export async function insertReviewOrder(
  db: DrizzleDatabase,
  row: InsertReviewOrderRow,
): Promise<{ id: string; orderNo: string }> {
  const inserted = await db
    .insert(reviewOrders)
    .values({
      orderNo: row.orderNo,
      customerName: row.customerName,
      productName: row.productName,
      salesperson: row.salesperson,
      hasSample: row.hasSample,
      sampleNotes: row.sampleNotes,
      expectedTestItems: row.expectedTestItems,
      boxSpecSnapshot: row.boxSpecSnapshot,
      requestedLayerCount: row.requestedLayerCount,
      printingRequirements: row.printingRequirements,
      physicalRequirements: row.physicalRequirements,
      status: "pending_process_review",
      createdBy: row.createdBy,
    })
    .returning({ id: reviewOrders.id, orderNo: reviewOrders.orderNo });

  const firstRow = inserted[0];

  if (!firstRow) {
    throw new Error("插入评审工单失败：未返回生成记录");
  }

  return { id: firstRow.id, orderNo: firstRow.orderNo };
}

export interface ReviewOrderListItem {
  id: string;
  orderNo: string;
  customerName: string;
  productName: string;
  salesperson: string;
  hasSample: boolean;
  requestedLayerCount: number | null;
  status: string;
  createdAt: Date;
}

export async function listReviewOrders(
  db: DrizzleDatabase,
  limit = 100,
): Promise<ReviewOrderListItem[]> {
  return db
    .select({
      id: reviewOrders.id,
      orderNo: reviewOrders.orderNo,
      customerName: reviewOrders.customerName,
      productName: reviewOrders.productName,
      salesperson: reviewOrders.salesperson,
      hasSample: reviewOrders.hasSample,
      requestedLayerCount: reviewOrders.requestedLayerCount,
      status: reviewOrders.status,
      createdAt: reviewOrders.createdAt,
    })
    .from(reviewOrders)
    .orderBy(desc(reviewOrders.createdAt))
    .limit(limit);
}
