import { describe, expect, it } from "vitest";

import {
  cancelHistoricalOrderImport,
  confirmHistoricalOrderImport,
  type HistoricalOrderInsert,
} from "@/modules/historical-orders/import-commit";
import type { HistoricalOrderHabitSummaryInsert } from "@/modules/historical-orders/habit-summary";
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

const confirmedSizeBucketConfig: HistoricalOrderSizeBucketConfig = {
  confirmed: true,
  smallMaxVolume: 10_000_000,
  mediumMaxVolume: 30_000_000,
};

class InMemoryHistoricalOrderImportRepository implements HistoricalOrderImportRepository {
  batches: HistoricalOrderImportBatchRecord[] = [];
  rows: HistoricalOrderImportRowRecord[] = [];
  orders: HistoricalOrderInsert[] = [];
  habitSummaries: HistoricalOrderHabitSummaryInsert[] = [];
  failOrderWrite = false;

  async transaction<T>(run: (repository: HistoricalOrderImportRepository) => Promise<T>): Promise<T> {
    const batchSnapshot = structuredClone(this.batches);
    const rowSnapshot = structuredClone(this.rows);
    const orderSnapshot = structuredClone(this.orders);
    const summarySnapshot = structuredClone(this.habitSummaries);

    try {
      return await run(this);
    } catch (error) {
      this.batches = batchSnapshot;
      this.rows = rowSnapshot;
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
    this.orders.push(...orders.slice(0, 1));

    if (this.failOrderWrite) {
      throw new Error("write failed");
    }

    this.orders.push(...orders.slice(1));
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

describe("historical order import commit", () => {
  it("returns DATA_NOT_FOUND when confirming a missing batch", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "missing",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATA_NOT_FOUND",
        message: "未找到历史订单导入批次",
      },
    });
  });

  it("rejects a batch that has already been confirmed without adding orders", async () => {
    const repository = createRepositoryWithMixedRows();
    const batch = repository.batches[0];

    if (!batch) {
      throw new Error("expected batch fixture");
    }

    batch.status = "confirmed";

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected validation error");
    }
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(repository.orders).toHaveLength(0);
  });

  it("requires confirmed size buckets before writing historical orders", async () => {
    const repository = createRepositoryWithMixedRows();

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: {
        ...confirmedSizeBucketConfig,
        confirmed: false,
      },
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先确认尺寸区间",
      },
    });
    expect(repository.orders).toHaveLength(0);
  });

  it("writes non-failed rows, marks only statistical rows as statistical, and keeps exception reasons", async () => {
    const repository = createRepositoryWithMixedRows();

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        batchId: "batch-1",
        importedCount: 4,
        statisticalCount: 2,
        skippedFailedRowCount: 1,
        habitSummaryCount: 4,
      },
    });
    expect(repository.orders).toHaveLength(4);
    expect(repository.orders.filter((order) => order.isStatistical)).toHaveLength(2);
    expect(repository.orders.find((order) => order.importRowId === "row-pending")).toMatchObject({
      isStatistical: false,
      exceptionReasons: ["原纸代码存在大小写候选"],
    });
    expect(repository.orders.find((order) => order.importRowId === "row-exception")).toMatchObject({
      isStatistical: false,
      exceptionReasons: ["无法匹配原纸代码"],
    });
    expect(repository.batches[0]).toMatchObject({
      status: "confirmed",
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
  });

  it("rolls back partial order writes when confirmation fails", async () => {
    const repository = createRepositoryWithMixedRows();

    repository.failOrderWrite = true;

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: "历史订单导入失败，请稍后重试",
      },
    });
    const batch = repository.batches[0];

    if (!batch) {
      throw new Error("expected batch fixture");
    }

    expect(batch.status).toBe("previewed");
    expect(repository.orders).toHaveLength(0);
    expect(repository.habitSummaries).toHaveLength(0);
  });

  it("cancels a previewed batch without writing historical orders and prevents later confirmation", async () => {
    const repository = createRepositoryWithMixedRows();

    const cancelResult = await cancelHistoricalOrderImport({
      repository,
      batchId: "batch-1",
    });

    expect(cancelResult).toEqual({
      ok: true,
      data: {
        batchId: "batch-1",
        status: "cancelled",
      },
    });
    expect(repository.orders).toHaveLength(0);

    const confirmResult = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(confirmResult.ok).toBe(false);
    if (confirmResult.ok) {
      throw new Error("expected validation error");
    }
    expect(confirmResult.error.code).toBe("VALIDATION_ERROR");
    expect(repository.orders).toHaveLength(0);
  });
});

function createRepositoryWithMixedRows(): InMemoryHistoricalOrderImportRepository {
  const repository = new InMemoryHistoricalOrderImportRepository();

  repository.batches.push({
    id: "batch-1",
    fileName: "脱敏历史订单.xlsx",
    status: "previewed",
    summary: {
      importedCount: 4,
      statisticalCount: 2,
      pendingCount: 1,
      exceptionCount: 1,
      failedCount: 1,
    },
    sizeBucketConfig: {
      confirmed: false,
      smallMaxVolume: 10_000_000,
      mediumMaxVolume: 30_000_000,
    },
    createdBy: "operator",
  });
  repository.rows.push(
    createImportRow("row-statistical-1", "statistical", "脱敏产品A", "r2"),
    createImportRow("row-statistical-2", "statistical", "脱敏产品B", "r2"),
    createImportRow("row-pending", "pending", "脱敏产品C", "dc", [
      "原纸代码存在大小写候选",
    ]),
    createImportRow("row-exception", "exception", "脱敏产品D", "unknown", [
      "无法匹配原纸代码",
    ]),
    createImportRow("row-failed", "failed", "脱敏产品E", "", ["缺少纸质/配纸代码"]),
  );

  return repository;
}

function createImportRow(
  id: string,
  rowStatus: HistoricalOrderImportRowRecord["rowStatus"],
  productName: string,
  paperCodeText: string,
  errors: string[] = [],
): HistoricalOrderImportRowRecord {
  return {
    id,
    batchId: "batch-1",
    sheetName: "历史订单",
    rowNumber: Number(id.replace(/\D/g, "")) || 1,
    rowStatus,
    rawData: {
      订单日期: "2026-07-01",
      规格: "300*200*150",
      产品名称: productName,
      生产数量: "1000",
      纸质: paperCodeText,
    },
    normalizedData: {
      orderDate: "2026-07-01",
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      productName,
      quantity: 1000,
      paperCodeText,
      weightKg: 25,
    },
    paperCodeMatchResult: createPaperCodeMatchResult(rowStatus, paperCodeText),
    matchedMaterialIds: rowStatus === "statistical" ? ["material-r2"] : [],
    candidateMaterialIds: rowStatus === "pending" ? ["material-dc"] : [],
    errors: errors.map((message) => ({
      field: "paperCodeText",
      message,
    })),
  };
}

function createPaperCodeMatchResult(
  rowStatus: HistoricalOrderImportRowRecord["rowStatus"],
  paperCodeText: string,
): HistoricalOrderImportRowRecord["paperCodeMatchResult"] {
  if (rowStatus === "statistical") {
    return {
      status: "matched",
      input: paperCodeText,
      normalizedInput: paperCodeText,
      material: {
        id: "material-r2",
        paperCode: "r2",
      },
    };
  }

  if (rowStatus === "pending") {
    return {
      status: "case_mismatch",
      input: paperCodeText,
      normalizedInput: paperCodeText,
      candidates: [
        {
          id: "material-dc",
          paperCode: "DC",
        },
      ],
      message: "原纸代码存在大小写候选",
    };
  }

  return {
    status: "unmatched",
    input: paperCodeText,
    normalizedInput: paperCodeText,
    message: "无法匹配原纸代码",
  };
}
