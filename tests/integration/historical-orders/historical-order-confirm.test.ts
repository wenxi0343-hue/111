import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { HistoricalOrderHabitSummaryInsert } from "@/modules/historical-orders/habit-summary";
import type { HistoricalOrderInsert } from "@/modules/historical-orders/import-commit";
import type {
  HistoricalOrderImportBatchRecord,
  HistoricalOrderImportRepository,
  HistoricalOrderImportRowRecord,
  HistoricalOrderPaperMaterialCandidate,
  HistoricalOrderSizeBucketConfig,
} from "@/modules/historical-orders/import-preview";
import type {
  HistoricalOrderHabitSummaryItem,
  ListHistoricalOrderHabitSummariesQuery,
} from "@/modules/historical-orders/list-habit-summaries";
import {
  cancelHistoricalOrderImport,
  confirmHistoricalOrderImport,
} from "@/server/actions/historical-order-actions";

const sessionSecret = "historical-order-session-secret";
const validEnv = {
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_USERS_JSON: JSON.stringify([
    {
      username: "operator",
      displayName: "操作员",
      passwordHash: "scrypt$1024$8$1$c2FsdA$aGFzaA",
    },
  ]),
};
const confirmedSizeBucketConfig: HistoricalOrderSizeBucketConfig = {
  confirmed: true,
  smallMaxVolume: 10_000_000,
  mediumMaxVolume: 30_000_000,
};

function createCookieStore(sessionValue?: string) {
  return {
    get(name: string) {
      return name === "paper_box_auth_session" && sessionValue ? { value: sessionValue } : undefined;
    },
  };
}

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now: new Date("2026-07-03T00:00:00.000Z"),
  });

  return createCookieStore(session.value);
}

class InMemoryHistoricalOrderImportRepository implements HistoricalOrderImportRepository {
  batches: HistoricalOrderImportBatchRecord[] = [
    {
      id: "batch-1",
      fileName: "脱敏历史订单.xlsx",
      status: "previewed",
      summary: {
        importedCount: 1,
        statisticalCount: 1,
        pendingCount: 0,
        exceptionCount: 0,
        failedCount: 0,
      },
      sizeBucketConfig: {
        confirmed: false,
        smallMaxVolume: 10_000_000,
        mediumMaxVolume: 30_000_000,
      },
      createdBy: "operator",
    },
  ];
  rows: HistoricalOrderImportRowRecord[] = [createImportRow()];
  orders: HistoricalOrderInsert[] = [];
  habitSummaries: HistoricalOrderHabitSummaryInsert[] = [];

  async transaction<T>(run: (repository: HistoricalOrderImportRepository) => Promise<T>): Promise<T> {
    const batchSnapshot = structuredClone(this.batches);
    const orderSnapshot = structuredClone(this.orders);
    const summarySnapshot = structuredClone(this.habitSummaries);

    try {
      return await run(this);
    } catch (error) {
      this.batches = batchSnapshot;
      this.orders = orderSnapshot;
      this.habitSummaries = summarySnapshot;
      throw error;
    }
  }

  async listPaperMaterialsForPreview(): Promise<HistoricalOrderPaperMaterialCandidate[]> {
    return [];
  }

  async saveImportPreview(): Promise<{ batchId: string }> {
    throw new Error("not used");
  }

  async findImportBatchById(batchId: string): Promise<HistoricalOrderImportBatchRecord | undefined> {
    return this.batches.find((batch) => batch.id === batchId);
  }

  async listImportRowsByBatchId(batchId: string): Promise<HistoricalOrderImportRowRecord[]> {
    return this.rows.filter((row) => row.batchId === batchId);
  }

  async createHistoricalOrders(orders: HistoricalOrderInsert[]): Promise<void> {
    this.orders.push(...orders);
  }

  async createHistoricalOrderHabitSummaries(
    summaries: HistoricalOrderHabitSummaryInsert[],
  ): Promise<void> {
    this.habitSummaries.push(...summaries);
  }

  async listHistoricalOrderHabitSummaries(
    query: ListHistoricalOrderHabitSummariesQuery = {},
  ): Promise<HistoricalOrderHabitSummaryItem[]> {
    return this.habitSummaries
      .filter(
        (summary) =>
          (query.dimensionType === undefined || summary.dimensionType === query.dimensionType) &&
          (query.dimensionKey === undefined || summary.dimensionKey === query.dimensionKey),
      )
      .sort((left, right) => right.orderCount - left.orderCount)
      .slice(0, query.limit ?? 30);
  }

  async markImportBatchConfirmed(input: {
    batchId: string;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void> {
    const batch = this.batches.find((item) => item.id === input.batchId);

    if (!batch) {
      throw new Error("batch not found");
    }

    batch.status = "confirmed";
    batch.sizeBucketConfig = input.sizeBucketConfig;
    batch.confirmedBy = input.confirmedBy;
    batch.confirmedAt = input.confirmedAt;
  }

  async markImportBatchCancelled(batchId: string): Promise<void> {
    const batch = this.batches.find((item) => item.id === batchId);

    if (!batch) {
      throw new Error("batch not found");
    }

    batch.status = "cancelled";
  }
}

describe("historical order confirm server actions", () => {
  it("does not confirm or cancel a batch without login", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    const confirmResult = await confirmHistoricalOrderImport(
      {
        batchId: "batch-1",
        sizeBucketConfig: confirmedSizeBucketConfig,
      },
      {
        env: validEnv,
        cookieStore: createCookieStore(),
        repository,
      },
    );
    const cancelResult = await cancelHistoricalOrderImport("batch-1", {
      env: validEnv,
      cookieStore: createCookieStore(),
      repository,
    });

    expect(confirmResult).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(cancelResult).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    const batch = repository.batches[0];

    if (!batch) {
      throw new Error("expected batch fixture");
    }

    expect(batch.status).toBe("previewed");
    expect(repository.orders).toHaveLength(0);
  });

  it("confirms a previewed batch and writes historical orders for logged in users", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    const result = await confirmHistoricalOrderImport(
      {
        batchId: "batch-1",
        sizeBucketConfig: confirmedSizeBucketConfig,
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
        now: new Date("2026-07-03T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        batchId: "batch-1",
        importedCount: 1,
        statisticalCount: 1,
        skippedFailedRowCount: 0,
        habitSummaryCount: 3,
      },
    });
    expect(repository.batches[0]).toMatchObject({
      status: "confirmed",
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
    expect(repository.orders).toHaveLength(1);
    const order = repository.orders[0];

    if (!order) {
      throw new Error("expected imported order");
    }

    expect(order).toMatchObject({
      importBatchId: "batch-1",
      importRowId: "row-1",
      isStatistical: true,
    });
  });

  it("cancels a previewed batch and rejects later confirmation", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    const cancelResult = await cancelHistoricalOrderImport("batch-1", {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });
    const confirmResult = await confirmHistoricalOrderImport(
      {
        batchId: "batch-1",
        sizeBucketConfig: confirmedSizeBucketConfig,
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(cancelResult).toEqual({
      ok: true,
      data: {
        batchId: "batch-1",
        status: "cancelled",
      },
    });
    expect(confirmResult.ok).toBe(false);
    if (confirmResult.ok) {
      throw new Error("expected validation error");
    }
    expect(confirmResult.error.code).toBe("VALIDATION_ERROR");
    expect(repository.orders).toHaveLength(0);
  });
});

function createImportRow(): HistoricalOrderImportRowRecord {
  return {
    id: "row-1",
    batchId: "batch-1",
    sheetName: "历史订单",
    rowNumber: 1,
    rowStatus: "statistical",
    rawData: {
      订单日期: "2026-07-01",
      规格: "300*200*150",
      产品名称: "脱敏产品A",
      生产数量: "1000",
      纸质: "r2",
    },
    normalizedData: {
      orderDate: "2026-07-01",
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      productName: "脱敏产品A",
      quantity: 1000,
      paperCodeText: "r2",
      weightKg: 25,
    },
    paperCodeMatchResult: {
      status: "matched",
      input: "r2",
      normalizedInput: "r2",
      material: {
        id: "material-r2",
        paperCode: "r2",
      },
    },
    matchedMaterialIds: ["material-r2"],
    candidateMaterialIds: [],
    errors: [],
  };
}
