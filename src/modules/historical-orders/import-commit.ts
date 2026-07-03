import type {
  HistoricalOrderImportRepository,
  HistoricalOrderImportRowRecord,
  HistoricalOrderSizeBucketConfig,
} from "@/modules/historical-orders/import-preview";
import { generateHistoricalOrderHabitSummaries } from "@/modules/historical-orders/habit-summary";
import type { ActionResult } from "@/shared/types/action-result";

export interface HistoricalOrderInsert {
  importBatchId: string;
  importRowId: string;
  orderDate: string;
  productName: string;
  productCategory?: string | undefined;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  quantity: number;
  weightKg?: number | undefined;
  rawPaperCode: string;
  parsedLayerCount?: number | undefined;
  parsedFlute?: string | undefined;
  matchedMaterialIds: string[];
  paperCodeStatus: string;
  exceptionReasons: string[];
  isStatistical: boolean;
}

export interface ConfirmHistoricalOrderImportResult {
  batchId: string;
  importedCount: number;
  statisticalCount: number;
  skippedFailedRowCount: number;
  habitSummaryCount: number;
}

export interface CancelHistoricalOrderImportResult {
  batchId: string;
  status: "cancelled";
}

export async function confirmHistoricalOrderImport(input: {
  repository: HistoricalOrderImportRepository;
  batchId: string;
  sizeBucketConfig: HistoricalOrderSizeBucketConfig;
  confirmedBy: string;
  confirmedAt: Date;
}): Promise<ActionResult<ConfirmHistoricalOrderImportResult>> {
  try {
    return await input.repository.transaction(async (repository) => {
      const batch = await repository.findImportBatchById(input.batchId);

      if (!batch) {
        return dataNotFound();
      }

      if (batch.status !== "previewed") {
        return invalidBatchStatus();
      }

      if (!input.sizeBucketConfig.confirmed) {
        return validationError("请先确认尺寸区间");
      }

      const rows = await repository.listImportRowsByBatchId(input.batchId);
      const historicalOrders = rows
        .filter((row) => row.rowStatus !== "failed")
        .map((row) => toHistoricalOrderInsert(input.batchId, row));
      const materials = await repository.listPaperMaterialsForPreview();
      const habitSummaries = generateHistoricalOrderHabitSummaries({
        importBatchId: input.batchId,
        orders: historicalOrders,
        materials,
        sizeBucketConfig: input.sizeBucketConfig,
      });

      await repository.createHistoricalOrders(historicalOrders);
      await repository.createHistoricalOrderHabitSummaries(habitSummaries);
      await repository.markImportBatchConfirmed({
        batchId: input.batchId,
        sizeBucketConfig: input.sizeBucketConfig,
        confirmedBy: input.confirmedBy,
        confirmedAt: input.confirmedAt,
      });

      return {
        ok: true,
        data: {
          batchId: input.batchId,
          importedCount: historicalOrders.length,
          statisticalCount: historicalOrders.filter((order) => order.isStatistical).length,
          skippedFailedRowCount: rows.length - historicalOrders.length,
          habitSummaryCount: habitSummaries.length,
        },
      };
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: "历史订单导入失败，请稍后重试",
      },
    };
  }
}

export async function cancelHistoricalOrderImport(input: {
  repository: HistoricalOrderImportRepository;
  batchId: string;
}): Promise<ActionResult<CancelHistoricalOrderImportResult>> {
  try {
    return await input.repository.transaction(async (repository) => {
      const batch = await repository.findImportBatchById(input.batchId);

      if (!batch) {
        return dataNotFound();
      }

      if (batch.status !== "previewed") {
        return invalidBatchStatus();
      }

      await repository.markImportBatchCancelled(input.batchId);

      return {
        ok: true,
        data: {
          batchId: input.batchId,
          status: "cancelled",
        },
      };
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: "历史订单导入失败，请稍后重试",
      },
    };
  }
}

function toHistoricalOrderInsert(
  batchId: string,
  row: HistoricalOrderImportRowRecord,
): HistoricalOrderInsert {
  const normalizedData = row.normalizedData;

  if (
    !normalizedData.orderDate ||
    !normalizedData.productName ||
    normalizedData.lengthMm === undefined ||
    normalizedData.widthMm === undefined ||
    normalizedData.heightMm === undefined ||
    normalizedData.quantity === undefined
  ) {
    throw new Error("confirmed historical order row is missing required normalized fields");
  }

  return {
    importBatchId: batchId,
    importRowId: row.id,
    orderDate: normalizedData.orderDate,
    productName: normalizedData.productName,
    productCategory: normalizedData.productCategory,
    lengthMm: normalizedData.lengthMm,
    widthMm: normalizedData.widthMm,
    heightMm: normalizedData.heightMm,
    quantity: normalizedData.quantity,
    weightKg: normalizedData.weightKg,
    rawPaperCode: normalizedData.paperCodeText ?? "",
    matchedMaterialIds: row.matchedMaterialIds,
    paperCodeStatus: row.paperCodeMatchResult.status,
    exceptionReasons: row.errors.map((error) => error.message),
    isStatistical: row.rowStatus === "statistical",
  };
}

function dataNotFound(): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "DATA_NOT_FOUND",
      message: "未找到历史订单导入批次",
    },
  };
}

function invalidBatchStatus(): ActionResult<never> {
  return validationError("该历史订单导入批次不可重复确认或取消");
}

function validationError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  };
}
