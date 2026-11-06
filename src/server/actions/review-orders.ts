"use server";

import { getDatabaseUrl, createDatabaseClient } from "@/db";
import type { ActionResult } from "@/shared/types/action-result";
import type { CreateReviewOrderInput } from "@/modules/review-orders/types";
import { validateCreateReviewOrder } from "@/modules/review-orders/validate-review-order";
import {
  insertReviewOrder,
  listReviewOrders,
  type ReviewOrderListItem,
} from "@/modules/review-orders/drizzle-repository";
import { readAuthenticatedUser } from "@/server/guards/auth";

const DATABASE_CONNECTION_FAILED_MESSAGE = "数据库连接不可用，请检查地址、账号、密码或网络。";

function generateOrderNo(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `REV-${year}${month}${day}-${random}`;
}

interface ReviewOrderContext {
  db: ReturnType<typeof createDatabaseClient>["db"];
  close: () => Promise<void>;
}

function createReviewOrderContext(
  env: Record<string, string | undefined> = process.env,
): ActionResult<ReviewOrderContext> {
  const urlResult = getDatabaseUrl(env);

  if (!urlResult.ok) {
    return urlResult;
  }

  const client = createDatabaseClient(urlResult.data);

  return {
    ok: true,
    data: { db: client.db, close: client.close },
  };
}

export async function createReviewOrder(
  input: CreateReviewOrderInput,
): Promise<ActionResult<{ orderId: string; orderNo: string }>> {
  const validation = validateCreateReviewOrder(input);

  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: validation.error.code,
        message: validation.error.message,
        details: { fieldErrors: validation.error.fieldErrors },
      },
    };
  }

  const user = await readAuthenticatedUser();
  const salesperson = user?.username ?? "guest";
  const now = new Date();
  const orderNo = generateOrderNo(now);

  const context = createReviewOrderContext();

  if (!context.ok) {
    return context;
  }

  try {
    const result = await insertReviewOrder(context.data.db, {
      orderNo,
      customerName: validation.data.customerName,
      productName: validation.data.productName,
      salesperson,
      hasSample: validation.data.hasSample,
      sampleNotes: validation.data.sampleNotes ?? null,
      expectedTestItems: validation.data.expectedTestItems,
      boxSpecSnapshot: validation.data.boxSpec as unknown as Record<string, unknown>,
      requestedLayerCount: validation.data.requestedLayerCount ?? null,
      printingRequirements: validation.data.printingRequirements ?? null,
      physicalRequirements: validation.data.physicalRequirements ?? null,
      createdBy: salesperson,
    });

    return {
      ok: true,
      data: { orderId: result.id, orderNo: result.orderNo },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "DATABASE_CONNECTION_FAILED",
        message: DATABASE_CONNECTION_FAILED_MESSAGE,
      },
    };
  } finally {
    await context.data.close?.();
  }
}

export async function listReviewOrdersAction(): Promise<ActionResult<ReviewOrderListItem[]>> {
  const context = createReviewOrderContext();

  if (!context.ok) {
    return context;
  }

  try {
    const items = await listReviewOrders(context.data.db);

    return { ok: true, data: items };
  } catch {
    return {
      ok: false,
      error: {
        code: "DATABASE_CONNECTION_FAILED",
        message: DATABASE_CONNECTION_FAILED_MESSAGE,
      },
    };
  } finally {
    await context.data.close?.();
  }
}
