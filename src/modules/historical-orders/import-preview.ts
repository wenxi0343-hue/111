import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  historicalOrderImportBatches,
  historicalOrderImportRows,
  historicalOrderHabitSummaries,
  historicalOrders,
  paperFactories,
  paperMaterials,
} from "@/db/schema";
import type * as schema from "@/db/schema";
import type { HistoricalOrderHabitSummaryInsert } from "@/modules/historical-orders/habit-summary";
import type { HistoricalOrderInsert } from "@/modules/historical-orders/import-commit";
import type {
  HistoricalOrderHabitSummaryItem,
  ListHistoricalOrderHabitSummariesQuery,
} from "@/modules/historical-orders/list-habit-summaries";
import type {
  HistoricalOrderImportFieldIssue,
  HistoricalOrderNormalizedData,
  NormalizedHistoricalOrderImportRow,
} from "@/modules/import-export/historical-order-workbook-parser";
import {
  matchPaperCode,
  type PaperCodeMatchCandidate,
  type PaperCodeMatchResult,
} from "@/modules/paper-code/match-paper-code";

export type HistoricalOrderImportBatchStatus = "previewed" | "confirmed" | "cancelled" | "failed";
export type HistoricalOrderImportRowStatus = "statistical" | "pending" | "exception" | "failed";

export interface HistoricalOrderImportSummary {
  importedCount: number;
  statisticalCount: number;
  pendingCount: number;
  exceptionCount: number;
  failedCount: number;
}

export interface HistoricalOrderSizeBucketConfig {
  confirmed: boolean;
  smallMaxVolume: number;
  mediumMaxVolume: number;
}

export interface HistoricalOrderPaperMaterialCandidate extends PaperCodeMatchCandidate {
  factoryName?: string | undefined;
  gramWeightGsm?: number | undefined;
}

export interface HistoricalOrderImportPreviewRow extends NormalizedHistoricalOrderImportRow {
  id?: string | undefined;
  rowStatus: HistoricalOrderImportRowStatus;
  paperCodeMatchResult: PaperCodeMatchResult<HistoricalOrderPaperMaterialCandidate>;
  matchedMaterialIds: string[];
  candidateMaterialIds: string[];
}

export interface HistoricalOrderImportPreview {
  summary: HistoricalOrderImportSummary;
  sizeBucketPreview: HistoricalOrderSizeBucketConfig;
  rows: HistoricalOrderImportPreviewRow[];
}

export interface HistoricalOrderImportBatchRecord {
  id: string;
  fileName: string;
  status: HistoricalOrderImportBatchStatus;
  summary: HistoricalOrderImportSummary;
  sizeBucketConfig: HistoricalOrderSizeBucketConfig;
  createdBy: string;
  confirmedBy?: string | undefined;
  createdAt?: Date | undefined;
  confirmedAt?: Date | undefined;
}

export interface HistoricalOrderImportRowRecord {
  id: string;
  batchId: string;
  sheetName: string | null;
  rowNumber: number;
  rowStatus: HistoricalOrderImportRowStatus;
  rawData: Record<string, string>;
  normalizedData: HistoricalOrderNormalizedData;
  paperCodeMatchResult: PaperCodeMatchResult<HistoricalOrderPaperMaterialCandidate>;
  matchedMaterialIds: string[];
  candidateMaterialIds: string[];
  errors: HistoricalOrderImportFieldIssue[];
}

export interface HistoricalOrderImportRepository {
  transaction<T>(run: (repository: HistoricalOrderImportRepository) => Promise<T>): Promise<T>;
  listPaperMaterialsForPreview(): Promise<HistoricalOrderPaperMaterialCandidate[]>;
  saveImportPreview(input: {
    fileName: string;
    summary: HistoricalOrderImportSummary;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
    rows: Array<Omit<HistoricalOrderImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }>;
  findImportBatchById(batchId: string): Promise<HistoricalOrderImportBatchRecord | undefined>;
  listImportRowsByBatchId(batchId: string): Promise<HistoricalOrderImportRowRecord[]>;
  createHistoricalOrders(orders: HistoricalOrderInsert[]): Promise<void>;
  createHistoricalOrderHabitSummaries(summaries: HistoricalOrderHabitSummaryInsert[]): Promise<void>;
  listHistoricalOrderHabitSummaries(
    query?: ListHistoricalOrderHabitSummariesQuery | undefined,
  ): Promise<HistoricalOrderHabitSummaryItem[]>;
  markImportBatchConfirmed(input: {
    batchId: string;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void>;
  markImportBatchCancelled(batchId: string): Promise<void>;
}

export function createHistoricalOrderImportPreview(input: {
  rows: NormalizedHistoricalOrderImportRow[];
  existingMaterials: HistoricalOrderPaperMaterialCandidate[];
}): HistoricalOrderImportPreview {
  const rows = input.rows.map<HistoricalOrderImportPreviewRow>((row) =>
    buildHistoricalOrderImportPreviewRow(row, input.existingMaterials),
  );

  return {
    summary: summarizeHistoricalOrderPreviewRows(rows),
    sizeBucketPreview: buildSizeBucketPreview(rows),
    rows,
  };
}

export async function saveHistoricalOrderImportPreview(input: {
  repository: HistoricalOrderImportRepository;
  preview: HistoricalOrderImportPreview;
  fileName: string;
  createdBy: string;
}): Promise<{ batchId: string }> {
  return input.repository.saveImportPreview({
    fileName: input.fileName,
    summary: input.preview.summary,
    sizeBucketConfig: input.preview.sizeBucketPreview,
    createdBy: input.createdBy,
    rows: input.preview.rows.map((row) => ({
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus,
      rawData: row.rawData,
      normalizedData: row.normalizedData,
      paperCodeMatchResult: row.paperCodeMatchResult,
      matchedMaterialIds: row.matchedMaterialIds,
      candidateMaterialIds: row.candidateMaterialIds,
      errors: row.errors,
    })),
  });
}

export function createDrizzleHistoricalOrderImportRepository(
  db: NodePgDatabase<typeof schema>,
): HistoricalOrderImportRepository {
  return new DrizzleHistoricalOrderImportRepository(db);
}

function buildHistoricalOrderImportPreviewRow(
  row: NormalizedHistoricalOrderImportRow,
  existingMaterials: HistoricalOrderPaperMaterialCandidate[],
): HistoricalOrderImportPreviewRow {
  const blockingErrors = row.errors.filter((error) => error.field !== "paperCodeText");

  if (blockingErrors.length > 0) {
    return {
      ...row,
      rowStatus: "failed",
      paperCodeMatchResult: matchPaperCode({
        paperCode: undefined,
        candidates: existingMaterials,
      }),
      matchedMaterialIds: [],
      candidateMaterialIds: [],
      errors: blockingErrors,
    };
  }

  const paperCodeMatchResult = matchPaperCode({
    paperCode: row.normalizedData.paperCodeText,
    candidates: existingMaterials,
  });
  const paperCodeErrors = getPaperCodeMatchErrors(paperCodeMatchResult);

  return {
    ...row,
    rowStatus: getRowStatusFromPaperCodeMatch(paperCodeMatchResult),
    paperCodeMatchResult,
    matchedMaterialIds:
      paperCodeMatchResult.status === "matched" ? [paperCodeMatchResult.material.id] : [],
    candidateMaterialIds:
      paperCodeMatchResult.status === "case_mismatch" ||
      paperCodeMatchResult.status === "ambiguous_case"
        ? paperCodeMatchResult.candidates.map((candidate) => candidate.id)
        : [],
    errors: paperCodeErrors,
  };
}

function getRowStatusFromPaperCodeMatch(
  result: PaperCodeMatchResult<HistoricalOrderPaperMaterialCandidate>,
): HistoricalOrderImportRowStatus {
  if (result.status === "matched") {
    return "statistical";
  }

  if (result.status === "case_mismatch" || result.status === "ambiguous_case") {
    return "pending";
  }

  return "exception";
}

function getPaperCodeMatchErrors(
  result: PaperCodeMatchResult<HistoricalOrderPaperMaterialCandidate>,
): HistoricalOrderImportFieldIssue[] {
  if (result.status === "matched") {
    return [];
  }

  const messages: Record<typeof result.status, string> = {
    case_mismatch: "原纸代码疑似大小写错误",
    ambiguous_case: "原纸代码存在多个大小写候选",
    suspected_gram_weight: "疑似克重误填为原纸代码",
    empty: "纸质/配纸代码为空",
    unmatched: "无法匹配原纸代码",
  };

  return [
    {
      field: "paperCodeText",
      message: messages[result.status],
    },
  ];
}

function summarizeHistoricalOrderPreviewRows(
  rows: HistoricalOrderImportPreviewRow[],
): HistoricalOrderImportSummary {
  return rows.reduce<HistoricalOrderImportSummary>(
    (summary, row) => ({
      importedCount: summary.importedCount + (row.rowStatus === "failed" ? 0 : 1),
      statisticalCount: summary.statisticalCount + (row.rowStatus === "statistical" ? 1 : 0),
      pendingCount: summary.pendingCount + (row.rowStatus === "pending" ? 1 : 0),
      exceptionCount: summary.exceptionCount + (row.rowStatus === "exception" ? 1 : 0),
      failedCount: summary.failedCount + (row.rowStatus === "failed" ? 1 : 0),
    }),
    {
      importedCount: 0,
      statisticalCount: 0,
      pendingCount: 0,
      exceptionCount: 0,
      failedCount: 0,
    },
  );
}

function buildSizeBucketPreview(
  rows: HistoricalOrderImportPreviewRow[],
): HistoricalOrderSizeBucketConfig {
  const volumes = rows
    .filter((row) => row.rowStatus !== "failed")
    .map((row) => {
      const { lengthMm, widthMm, heightMm } = row.normalizedData;

      return lengthMm && widthMm && heightMm ? lengthMm * widthMm * heightMm : undefined;
    })
    .filter((volume): volume is number => volume !== undefined)
    .sort((left, right) => left - right);

  if (volumes.length === 0) {
    return {
      confirmed: false,
      smallMaxVolume: 10_000_000,
      mediumMaxVolume: 30_000_000,
    };
  }

  const smallIndex = Math.max(0, Math.ceil(volumes.length / 3) - 1);
  const mediumIndex = Math.max(0, Math.ceil((volumes.length * 2) / 3) - 1);

  return {
    confirmed: false,
    smallMaxVolume: volumes[smallIndex] ?? volumes[0] ?? 10_000_000,
    mediumMaxVolume: volumes[mediumIndex] ?? volumes.at(-1) ?? 30_000_000,
  };
}

class DrizzleHistoricalOrderImportRepository implements HistoricalOrderImportRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async transaction<T>(run: (repository: HistoricalOrderImportRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => run(new DrizzleHistoricalOrderImportRepository(tx)));
  }

  async listPaperMaterialsForPreview(): Promise<HistoricalOrderPaperMaterialCandidate[]> {
    const rows = await this.db
      .select({
        id: paperMaterials.id,
        paperCode: paperMaterials.paperCode,
        factoryName: paperFactories.name,
        gramWeightGsm: paperMaterials.gramWeightGsm,
      })
      .from(paperMaterials)
      .leftJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(eq(paperMaterials.isActive, true))
      .orderBy(asc(paperMaterials.paperCode));

    return rows.map((row) => ({
      id: row.id,
      paperCode: row.paperCode,
      ...(row.factoryName !== null ? { factoryName: row.factoryName } : {}),
      gramWeightGsm: row.gramWeightGsm,
    }));
  }

  async saveImportPreview(input: {
    fileName: string;
    summary: HistoricalOrderImportSummary;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
    rows: Array<Omit<HistoricalOrderImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }> {
    const [batch] = await this.db
      .insert(historicalOrderImportBatches)
      .values({
        fileName: input.fileName,
        status: "previewed",
        summary: input.summary,
        sizeBucketConfig: input.sizeBucketConfig,
        createdBy: input.createdBy,
      })
      .returning({ id: historicalOrderImportBatches.id });

    if (!batch) {
      throw new Error("failed to create historical order import batch");
    }

    if (input.rows.length > 0) {
      await this.db.insert(historicalOrderImportRows).values(
        input.rows.map((row) => ({
          batchId: batch.id,
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          rowStatus: row.rowStatus,
          rawData: row.rawData,
          normalizedData: row.normalizedData,
          paperCodeMatchResult: row.paperCodeMatchResult,
          matchedMaterialIds: row.matchedMaterialIds,
          candidateMaterialIds: row.candidateMaterialIds,
          errors: row.errors,
        })),
      );
    }

    return { batchId: batch.id };
  }

  async findImportBatchById(
    batchId: string,
  ): Promise<HistoricalOrderImportBatchRecord | undefined> {
    const [batch] = await this.db
      .select()
      .from(historicalOrderImportBatches)
      .where(eq(historicalOrderImportBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return undefined;
    }

    return {
      id: batch.id,
      fileName: batch.fileName,
      status: batch.status as HistoricalOrderImportBatchStatus,
      summary: batch.summary as HistoricalOrderImportSummary,
      sizeBucketConfig: batch.sizeBucketConfig as HistoricalOrderSizeBucketConfig,
      createdBy: batch.createdBy,
      confirmedBy: batch.confirmedBy ?? undefined,
      createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt ?? undefined,
    };
  }

  async listImportRowsByBatchId(batchId: string): Promise<HistoricalOrderImportRowRecord[]> {
    const rows = await this.db
      .select()
      .from(historicalOrderImportRows)
      .where(eq(historicalOrderImportRows.batchId, batchId))
      .orderBy(asc(historicalOrderImportRows.rowNumber));

    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus as HistoricalOrderImportRowStatus,
      rawData: row.rawData as Record<string, string>,
      normalizedData: row.normalizedData as HistoricalOrderNormalizedData,
      paperCodeMatchResult:
        row.paperCodeMatchResult as PaperCodeMatchResult<HistoricalOrderPaperMaterialCandidate>,
      matchedMaterialIds: row.matchedMaterialIds as string[],
      candidateMaterialIds: row.candidateMaterialIds as string[],
      errors: row.errors as HistoricalOrderImportFieldIssue[],
    }));
  }

  async createHistoricalOrders(orders: HistoricalOrderInsert[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    await this.db.insert(historicalOrders).values(
      orders.map((order) => ({
        importBatchId: order.importBatchId,
        importRowId: order.importRowId,
        orderDate: order.orderDate,
        productName: order.productName,
        productCategory: order.productCategory,
        lengthMm: order.lengthMm,
        widthMm: order.widthMm,
        heightMm: order.heightMm,
        quantity: order.quantity,
        weightKg: order.weightKg !== undefined ? String(order.weightKg) : null,
        rawPaperCode: order.rawPaperCode,
        parsedLayerCount: order.parsedLayerCount,
        parsedFlute: order.parsedFlute,
        matchedMaterialIds: order.matchedMaterialIds,
        paperCodeStatus: order.paperCodeStatus,
        exceptionReasons: order.exceptionReasons,
        isStatistical: order.isStatistical,
      })),
    );
  }

  async createHistoricalOrderHabitSummaries(
    summaries: HistoricalOrderHabitSummaryInsert[],
  ): Promise<void> {
    if (summaries.length === 0) {
      return;
    }

    await this.db.insert(historicalOrderHabitSummaries).values(
      summaries.map((summary) => ({
        importBatchId: summary.importBatchId,
        dimensionType: summary.dimensionType,
        dimensionKey: summary.dimensionKey,
        layerCount: summary.layerCount,
        flute: summary.flute,
        factoryNames: summary.factoryNames,
        gramWeights: summary.gramWeights,
        orderCount: summary.orderCount,
        frequency: String(summary.frequency),
      })),
    );
  }

  async listHistoricalOrderHabitSummaries(
    query: ListHistoricalOrderHabitSummariesQuery = {},
  ): Promise<HistoricalOrderHabitSummaryItem[]> {
    const rows = await this.db
      .select()
      .from(historicalOrderHabitSummaries)
      .orderBy(asc(historicalOrderHabitSummaries.dimensionType));

    return rows
      .map((row) => ({
        id: row.id,
        importBatchId: row.importBatchId ?? "",
        dimensionType: row.dimensionType as HistoricalOrderHabitSummaryItem["dimensionType"],
        dimensionKey: row.dimensionKey,
        layerCount: row.layerCount ?? undefined,
        flute: row.flute ?? undefined,
        factoryNames: row.factoryNames as string[],
        gramWeights: row.gramWeights as number[],
        orderCount: row.orderCount,
        frequency: Number(row.frequency),
        generatedAt: row.generatedAt,
      }))
      .filter(
        (item) =>
          (query.dimensionType === undefined || item.dimensionType === query.dimensionType) &&
          (query.dimensionKey === undefined || item.dimensionKey === query.dimensionKey),
      )
      .sort((left, right) => {
        if (left.dimensionType !== right.dimensionType) {
          return left.dimensionType.localeCompare(right.dimensionType);
        }

        if (left.dimensionKey !== right.dimensionKey) {
          return left.dimensionKey.localeCompare(right.dimensionKey);
        }

        return right.orderCount - left.orderCount;
      })
      .slice(0, query.limit ?? 30);
  }

  async markImportBatchConfirmed(input: {
    batchId: string;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void> {
    await this.db
      .update(historicalOrderImportBatches)
      .set({
        status: "confirmed",
        sizeBucketConfig: input.sizeBucketConfig,
        confirmedBy: input.confirmedBy,
        confirmedAt: input.confirmedAt,
      })
      .where(eq(historicalOrderImportBatches.id, input.batchId));
  }

  async markImportBatchCancelled(batchId: string): Promise<void> {
    await this.db
      .update(historicalOrderImportBatches)
      .set({
        status: "cancelled",
      })
      .where(eq(historicalOrderImportBatches.id, batchId));
  }
}
