import { Workbook } from "exceljs";
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
  listHistoricalOrderHabitSummaries,
  previewHistoricalOrderImport,
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

async function createHistoricalOrderWorkbookFile(fileName = "历史订单.xlsx"): Promise<File> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("历史订单");

  sheet.addRow(["订单日期", "规格", "产品名称", "生产数量", "纸质"]);
  sheet.addRow(["2026-07-01", "300*200*150", "脱敏产品A", 1000, "r2"]);

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer);

  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function createHistoricalOrderImportFormData(fileName?: string): Promise<FormData> {
  const formData = new FormData();

  formData.set("file", await createHistoricalOrderWorkbookFile(fileName));

  return formData;
}

class InMemoryHistoricalOrderImportRepository implements HistoricalOrderImportRepository {
  batches: HistoricalOrderImportBatchRecord[] = [];
  rows: HistoricalOrderImportRowRecord[] = [];
  orders: HistoricalOrderInsert[] = [];
  habitSummaries: HistoricalOrderHabitSummaryInsert[] = [];
  materials: HistoricalOrderPaperMaterialCandidate[] = [
    {
      id: "material-r2",
      paperCode: "r2",
      factoryName: "脱敏纸厂A",
      gramWeightGsm: 105,
    },
  ];

  async listPaperMaterialsForPreview(): Promise<HistoricalOrderPaperMaterialCandidate[]> {
    return this.materials;
  }

  async transaction<T>(run: (repository: HistoricalOrderImportRepository) => Promise<T>): Promise<T> {
    return run(this);
  }

  async saveImportPreview(input: {
    fileName: string;
    summary: HistoricalOrderImportBatchRecord["summary"];
    sizeBucketConfig: HistoricalOrderImportBatchRecord["sizeBucketConfig"];
    rows: Array<Omit<HistoricalOrderImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }> {
    const batchId = `batch-${this.batches.length + 1}`;

    this.batches.push({
      id: batchId,
      fileName: input.fileName,
      status: "previewed",
      summary: input.summary,
      sizeBucketConfig: input.sizeBucketConfig,
      createdBy: input.createdBy,
    });
    this.rows.push(
      ...input.rows.map((row, index) => ({
        ...row,
        id: `row-${index + 1}`,
        batchId,
      })),
    );

    return { batchId };
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

describe("historical order import server actions", () => {
  it("does not parse or save rows when preview is called without login", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();
    const formData = await createHistoricalOrderImportFormData();

    const result = await previewHistoricalOrderImport(formData, {
      env: validEnv,
      cookieStore: createCookieStore(),
      repository,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(repository.batches).toHaveLength(0);
    expect(repository.rows).toHaveLength(0);
  });

  it("saves a historical order preview batch for a valid xlsx workbook", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();
    const formData = await createHistoricalOrderImportFormData();

    const result = await previewHistoricalOrderImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.batchId).toBe("batch-1");
    expect(result.data.summary).toEqual({
      importedCount: 1,
      statisticalCount: 1,
      pendingCount: 0,
      exceptionCount: 0,
      failedCount: 0,
    });
    expect(result.data.rows[0]).toMatchObject({
      id: "row-1",
      rowStatus: "statistical",
      matchedMaterialIds: ["material-r2"],
    });
    expect(repository.batches[0]).toMatchObject({
      id: "batch-1",
      fileName: "历史订单.xlsx",
      status: "previewed",
      createdBy: "operator",
    });
    expect(repository.rows[0]).toMatchObject({
      batchId: "batch-1",
      rowStatus: "statistical",
      normalizedData: expect.objectContaining({
        productName: "脱敏产品A",
        paperCodeText: "r2",
      }),
    });
  });

  it("rejects legacy xls files without saving a preview batch", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();
    const formData = await createHistoricalOrderImportFormData("近三年订单数据.xls");

    const result = await previewHistoricalOrderImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先将历史订单文件另存为 .xlsx 后再导入",
      },
    });
    expect(repository.batches).toHaveLength(0);
    expect(repository.rows).toHaveLength(0);
  });

  it("lists habit summaries by dimension and dimension key sorted by order count", async () => {
    const repository = new InMemoryHistoricalOrderImportRepository();

    repository.habitSummaries.push(
      {
        importBatchId: "batch-1",
        dimensionType: "product",
        dimensionKey: "脱敏电子产品",
        layerCount: 3,
        flute: "B",
        factoryNames: ["脱敏纸厂A"],
        gramWeights: [140],
        orderCount: 2,
        frequency: 0.4,
      },
      {
        importBatchId: "batch-1",
        dimensionType: "product",
        dimensionKey: "脱敏电子产品",
        layerCount: 5,
        flute: "BC",
        factoryNames: ["脱敏纸厂B"],
        gramWeights: [170],
        orderCount: 3,
        frequency: 0.6,
      },
      {
        importBatchId: "batch-1",
        dimensionType: "weight_bucket",
        dimensionKey: "≤20kg",
        layerCount: 3,
        flute: "B",
        factoryNames: ["脱敏纸厂A"],
        gramWeights: [140],
        orderCount: 1,
        frequency: 1,
      },
    );

    const result = await listHistoricalOrderHabitSummaries(
      {
        dimensionType: "product",
        dimensionKey: "脱敏电子产品",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        items: [
          expect.objectContaining({
            dimensionType: "product",
            dimensionKey: "脱敏电子产品",
            orderCount: 3,
          }),
          expect.objectContaining({
            dimensionType: "product",
            dimensionKey: "脱敏电子产品",
            orderCount: 2,
          }),
        ],
      },
    });
  });
});
