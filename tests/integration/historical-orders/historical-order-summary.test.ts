import { describe, expect, it } from "vitest";

import {
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
  batches: HistoricalOrderImportBatchRecord[] = [
    {
      id: "batch-1",
      fileName: "脱敏历史订单.xlsx",
      status: "previewed",
      summary: {
        importedCount: 3,
        statisticalCount: 3,
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
  rows: HistoricalOrderImportRowRecord[] = [
    createImportRow("row-1", "脱敏电子产品", 200, 200, 200, 20),
    createImportRow("row-2", "脱敏电子产品", 300, 200, 150, 25),
    createImportRow("row-3", "脱敏日用品", 600, 300, 200, 31),
  ];
  orders: HistoricalOrderInsert[] = [];
  habitSummaries: HistoricalOrderHabitSummaryInsert[] = [];
  materials: HistoricalOrderPaperMaterialCandidate[] = [
    {
      id: "material-r2",
      paperCode: "r2",
      factoryName: "脱敏纸厂A",
      gramWeightGsm: 140,
    },
  ];

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
    return this.materials;
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

describe("historical order habit summary integration", () => {
  it("creates product, size, and weight summaries after confirming an import batch", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    const result = await confirmHistoricalOrderImport({
      repository,
      batchId: "batch-1",
      sizeBucketConfig: confirmedSizeBucketConfig,
      confirmedBy: "operator",
      confirmedAt: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.habitSummaryCount).toBe(repository.habitSummaries.length);
    expect(repository.habitSummaries.length).toBeGreaterThan(0);
    expect(new Set(repository.habitSummaries.map((summary) => summary.dimensionType))).toEqual(
      new Set(["product", "size_bucket", "weight_bucket"]),
    );
  });
});

function createImportRow(
  id: string,
  productName: string,
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  weightKg: number,
): HistoricalOrderImportRowRecord {
  return {
    id,
    batchId: "batch-1",
    sheetName: "历史订单",
    rowNumber: Number(id.replace(/\D/g, "")) || 1,
    rowStatus: "statistical",
    rawData: {
      订单日期: "2026-07-01",
      规格: `${lengthMm}*${widthMm}*${heightMm}`,
      产品名称: productName,
      生产数量: "1000",
      纸质: "r2",
    },
    normalizedData: {
      orderDate: "2026-07-01",
      lengthMm,
      widthMm,
      heightMm,
      productName,
      quantity: 1000,
      paperCodeText: "r2",
      weightKg,
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
