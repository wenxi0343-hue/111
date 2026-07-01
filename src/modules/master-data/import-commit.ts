import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  masterDataChangeLogs,
  masterDataImportBatches,
  masterDataImportRows,
  paperMaterialMatchRules,
  paperMaterialPriceHistories,
  paperFactories,
  paperMaterials,
  paperQualityStandards,
} from "@/db/schema";
import type * as schema from "@/db/schema";
import type {
  ImportFieldIssue,
  PaperCodeNormalizedData,
  PaperPriceEntry,
  PaperPriceNormalizedData,
  QualityStandardNormalizedData,
} from "@/modules/import-export/master-data-workbook-parser";
import { calculatePaperMaterialCompleteness } from "@/modules/master-data/completeness";
import type {
  PaperCodeImportPreview,
  PaperPriceImportPreview,
  QualityStandardImportPreview,
} from "@/modules/master-data/import-preview";
import { buildPaperPriceSourceSignature } from "@/modules/master-data/match-import-row";
import type { ActionResult } from "@/shared/types/action-result";

export type MasterDataImportBatchStatus = "previewed" | "confirmed" | "cancelled" | "failed";
export type MasterDataImportRowStatus = "new" | "update" | "pending" | "failed" | "standard_rule";
export type MasterDataEntityType = "paper_factory" | "paper_material";
export type MasterDataChangeSource = "import" | "manual";
export type MasterDataImportSourceType =
  | "paper_code_table"
  | "paper_price_table"
  | "quality_standard_table";
export type MasterDataNormalizedData =
  | PaperCodeNormalizedData
  | PaperPriceNormalizedData
  | QualityStandardNormalizedData;

export interface MasterDataImportSummary {
  newCount: number;
  updateCount: number;
  pendingCount: number;
  failedCount: number;
  incompleteCount: number;
}

export interface MasterDataImportBatchRecord {
  id: string;
  sourceType: string;
  fileName: string;
  status: MasterDataImportBatchStatus;
  summary: MasterDataImportSummary;
  createdBy: string;
  confirmedBy?: string | undefined;
  createdAt?: Date | undefined;
  confirmedAt?: Date | undefined;
}

export interface MasterDataImportRowRecord {
  id: string;
  batchId: string;
  sheetName: string | null;
  rowNumber: number;
  rowStatus: MasterDataImportRowStatus;
  rawData: Record<string, string>;
  normalizedData: MasterDataNormalizedData;
  targetMaterialId?: string | undefined;
  candidateMaterialIds: string[];
  changeSet: Record<string, unknown>;
  errors: ImportFieldIssue[];
}

export interface PaperFactoryRecord {
  id: string;
  name: string;
  supplyTypes: string[];
  isActive: boolean;
}

export interface PaperMaterialRecord {
  id: string;
  paperCode: string;
  paperEncoding?: string | undefined;
  factoryId: string;
  factoryName?: string | undefined;
  name: string;
  paperKind: string;
  grade?: string | undefined;
  gramWeightGsm: number;
  usage?: string | undefined;
  applicableFlutes: string[];
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  completenessStatus: "complete" | "incomplete";
  missingFields: string[];
  isActive: boolean;
}

export interface MasterDataChangeLogRecord {
  id: string;
  entityType: MasterDataEntityType;
  entityId: string;
  changeSource: MasterDataChangeSource;
  importBatchId?: string | undefined;
  changedFields: Record<string, { before: unknown; after: unknown }>;
  reason?: string | undefined;
  changedBy: string;
  createdAt?: Date | undefined;
}

export interface PaperMaterialMatchRuleRecord {
  id: string;
  sourceType: string;
  sourceSignature: string;
  paperMaterialId: string;
  confirmedBy: string;
  createdAt?: Date | undefined;
}

export interface PaperMaterialPriceHistoryRecord {
  id: string;
  paperMaterialId: string;
  priceYuanPerTon: number;
  effectiveDate?: string | undefined;
  sourceFileName: string;
  sourceSheetName?: string | undefined;
  sourceRowNumber?: number | undefined;
  importBatchId?: string | undefined;
  createdAt?: Date | undefined;
}

export interface PaperQualityStandardRecord {
  id: string;
  paperKind: string;
  grade?: string | undefined;
  gramWeightMinGsm?: number | undefined;
  gramWeightMaxGsm?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  rawLabel: string;
  sourceFileName: string;
  sourceSheetName: string;
  createdAt?: Date | undefined;
}

export interface MasterDataImportRepository {
  transaction<T>(run: (repository: MasterDataImportRepository) => Promise<T>): Promise<T>;
  listPaperMaterialsForPreview(): Promise<PaperMaterialRecord[]>;
  saveImportPreview(input: {
    sourceType: string;
    fileName: string;
    summary: MasterDataImportSummary;
    rows: Array<Omit<MasterDataImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }>;
  findImportBatchById(batchId: string): Promise<MasterDataImportBatchRecord | undefined>;
  listImportRowsByBatchId(batchId: string): Promise<MasterDataImportRowRecord[]>;
  findImportRowById(input: {
    batchId: string;
    rowId: string;
  }): Promise<MasterDataImportRowRecord | undefined>;
  updateImportRowMatch(input: {
    batchId: string;
    rowId: string;
    targetMaterialId: string;
    rowStatus: "update";
  }): Promise<MasterDataImportRowRecord>;
  findPaperMaterialById(id: string): Promise<PaperMaterialRecord | undefined>;
  findPaperMaterialByCode(paperCode: string): Promise<PaperMaterialRecord | undefined>;
  findPaperFactoryByName(name: string): Promise<PaperFactoryRecord | undefined>;
  createPaperFactory(input: { name: string }): Promise<PaperFactoryRecord>;
  createPaperMaterial(
    input: Omit<PaperMaterialRecord, "id" | "factoryName">,
  ): Promise<PaperMaterialRecord>;
  updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialRecord, "id">>,
  ): Promise<PaperMaterialRecord>;
  createMatchRule(
    input: Omit<PaperMaterialMatchRuleRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialMatchRuleRecord>;
  createPriceHistory(
    input: Omit<PaperMaterialPriceHistoryRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialPriceHistoryRecord>;
  createQualityStandard(
    input: Omit<PaperQualityStandardRecord, "id" | "createdAt">,
  ): Promise<PaperQualityStandardRecord>;
  createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void>;
  markImportBatchConfirmed(input: {
    batchId: string;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void>;
  listChangeLogs(input: {
    entityType: MasterDataEntityType;
    entityId: string;
  }): Promise<MasterDataChangeLogRecord[]>;
}

export interface SavePaperCodeImportPreviewInput {
  repository: MasterDataImportRepository;
  preview: PaperCodeImportPreview;
  sourceType: string;
  fileName: string;
  createdBy: string;
}

export interface SaveMasterDataImportPreviewInput {
  repository: MasterDataImportRepository;
  preview: PaperCodeImportPreview | PaperPriceImportPreview | QualityStandardImportPreview;
  sourceType: MasterDataImportSourceType;
  fileName: string;
  createdBy: string;
}

export interface ConfirmPaperCodeImportBatchInput {
  repository: MasterDataImportRepository;
  batchId: string;
  confirmedBy: string;
  now?: Date;
}

export interface ConfirmPaperCodeImportBatchResult {
  batchId: string;
  createdFactoryCount: number;
  createdMaterialCount: number;
  updatedMaterialCount: number;
  skippedFailedRowCount: number;
}

export interface ResolveMasterDataImportRowInput {
  repository: MasterDataImportRepository;
  batchId: string;
  rowId: string;
  paperMaterialId: string;
  confirmedBy: string;
}

export interface ResolveMasterDataImportRowResult {
  rowId: string;
  rowStatus: "update";
  targetMaterialId: string;
}

type AppDatabase = NodePgDatabase<typeof schema>;

export async function savePaperCodeImportPreview({
  repository,
  preview,
  sourceType,
  fileName,
  createdBy,
}: SavePaperCodeImportPreviewInput): Promise<{ batchId: string }> {
  return saveMasterDataImportPreview({
    repository,
    preview,
    sourceType: sourceType as MasterDataImportSourceType,
    fileName,
    createdBy,
  });
}

export async function saveMasterDataImportPreview({
  repository,
  preview,
  sourceType,
  fileName,
  createdBy,
}: SaveMasterDataImportPreviewInput): Promise<{ batchId: string }> {
  return repository.saveImportPreview({
    sourceType,
    fileName,
    summary: preview.summary,
    createdBy,
    rows: preview.rows.map((row) => ({
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus,
      rawData: row.rawData,
      normalizedData: row.normalizedData,
      targetMaterialId: row.targetMaterialId,
      candidateMaterialIds: "candidateMaterialIds" in row ? row.candidateMaterialIds : [],
      changeSet: buildPreviewRowChangeSet(row),
      errors: row.errors,
    })),
  });
}

function buildPreviewRowChangeSet(
  row:
    | PaperCodeImportPreview["rows"][number]
    | PaperPriceImportPreview["rows"][number]
    | QualityStandardImportPreview["rows"][number],
): Record<string, unknown> {
  if ("sourceSignature" in row) {
    return {
      ...row.changeSet,
      sourceSignature: row.sourceSignature,
    };
  }

  if ("sourceRowNumbers" in row) {
    return {
      ...row.changeSet,
      sourceRowNumbers: row.sourceRowNumbers,
      ...(row.standardRule !== undefined ? { standardRule: row.standardRule } : {}),
      ...(row.notice !== undefined ? { notice: row.notice } : {}),
      ...(row.completenessStatus !== undefined
        ? { completenessStatus: row.completenessStatus }
        : {}),
      missingFields: row.missingFields,
    };
  }

  return {
    completenessStatus: row.completenessStatus,
    missingFields: row.missingFields,
    warnings: row.warnings,
  };
}

export async function confirmPaperCodeImportBatch({
  repository,
  batchId,
  confirmedBy,
  now = new Date(),
}: ConfirmPaperCodeImportBatchInput): Promise<ActionResult<ConfirmPaperCodeImportBatchResult>> {
  return repository.transaction(async (transactionRepository) => {
    const batch = await transactionRepository.findImportBatchById(batchId);

    if (!batch) {
      return {
        ok: false,
        error: {
          code: "DATA_NOT_FOUND",
          message: "导入批次不存在",
        },
      };
    }

    if (batch.status !== "previewed") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "该导入批次已确认或不可确认",
        },
      };
    }

    const rows = await transactionRepository.listImportRowsByBatchId(batchId);
    const pendingRow = rows.find((row) => row.rowStatus === "pending");

    if (pendingRow) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "请先处理待确认行后再确认入库",
        },
      };
    }

    const conflictResult = await findPaperCodeConflict(transactionRepository, rows);

    if (!conflictResult.ok) {
      return conflictResult;
    }

    const summary: ConfirmPaperCodeImportBatchResult = {
      batchId,
      createdFactoryCount: 0,
      createdMaterialCount: 0,
      updatedMaterialCount: 0,
      skippedFailedRowCount: 0,
    };

    for (const row of rows) {
      if (row.rowStatus === "failed") {
        summary.skippedFailedRowCount += 1;
        continue;
      }

      const normalizedData = row.normalizedData;

      if (
        !isPaperCodeData(normalizedData) ||
        !normalizedData.paperCode ||
        !normalizedData.supplierShortName ||
        !normalizedData.paperName ||
        normalizedData.gramWeightGsm === undefined
      ) {
        summary.skippedFailedRowCount += 1;
        continue;
      }

      const factoryResult = await findOrCreatePaperFactory(
        transactionRepository,
        normalizedData.supplierShortName,
      );
      const completeness = calculatePaperMaterialCompleteness({
        paperCode: normalizedData.paperCode,
        factoryName: factoryResult.factory.name,
        paperName: normalizedData.paperName,
        gramWeightGsm: normalizedData.gramWeightGsm,
        paperKind: "unknown",
      });

      if (factoryResult.created) {
        summary.createdFactoryCount += 1;
      }

      if (row.rowStatus === "update") {
        const existingMaterial = await transactionRepository.findPaperMaterialByCode(
          normalizedData.paperCode,
        );

        if (!existingMaterial) {
          return {
            ok: false,
            error: {
              code: "DATA_NOT_FOUND",
              message: `原纸代码 ${normalizedData.paperCode} 不存在，请重新预览后再确认`,
            },
          };
        }

        const updatedMaterial = await transactionRepository.updatePaperMaterial(
          existingMaterial.id,
          {
            paperEncoding: normalizedData.paperEncoding,
            factoryId: factoryResult.factory.id,
            factoryName: factoryResult.factory.name,
            name: normalizedData.paperName,
            gramWeightGsm: normalizedData.gramWeightGsm,
            paperKind: "unknown",
            applicableFlutes: existingMaterial.applicableFlutes,
            completenessStatus: completeness.status,
            missingFields: completeness.missingFields,
            isActive: existingMaterial.isActive,
          },
        );

        await transactionRepository.createChangeLog({
          entityType: "paper_material",
          entityId: updatedMaterial.id,
          changeSource: "import",
          importBatchId: batchId,
          changedFields: buildPaperMaterialChangeSet(existingMaterial, updatedMaterial),
          changedBy: confirmedBy,
          createdAt: now,
        });
        summary.updatedMaterialCount += 1;
        continue;
      }

      const createdMaterial = await transactionRepository.createPaperMaterial({
        paperCode: normalizedData.paperCode,
        paperEncoding: normalizedData.paperEncoding,
        factoryId: factoryResult.factory.id,
        name: normalizedData.paperName,
        paperKind: "unknown",
        gramWeightGsm: normalizedData.gramWeightGsm,
        applicableFlutes: [],
        completenessStatus: completeness.status,
        missingFields: completeness.missingFields,
        isActive: true,
      });

      await transactionRepository.createChangeLog({
        entityType: "paper_material",
        entityId: createdMaterial.id,
        changeSource: "import",
        importBatchId: batchId,
        changedFields: buildCreatedPaperMaterialChangeSet(createdMaterial),
        changedBy: confirmedBy,
        createdAt: now,
      });
      summary.createdMaterialCount += 1;
    }

    await transactionRepository.markImportBatchConfirmed({
      batchId,
      confirmedBy,
      confirmedAt: now,
    });

    return {
      ok: true,
      data: summary,
    };
  });
}

export async function resolveMasterDataImportRowInRepository({
  repository,
  batchId,
  rowId,
  paperMaterialId,
  confirmedBy,
}: ResolveMasterDataImportRowInput): Promise<ActionResult<ResolveMasterDataImportRowResult>> {
  return repository.transaction(async (transactionRepository) => {
    const batch = await transactionRepository.findImportBatchById(batchId);

    if (!batch) {
      return dataNotFoundError("导入批次不存在");
    }

    if (batch.status !== "previewed") {
      return validationError("该导入批次已确认或不可处理");
    }

    const row = await transactionRepository.findImportRowById({ batchId, rowId });

    if (!row) {
      return dataNotFoundError("导入行不存在");
    }

    if (row.rowStatus !== "pending") {
      return validationError("只有待确认行可以处理关联");
    }

    const material = await transactionRepository.findPaperMaterialById(paperMaterialId);

    if (!material) {
      return dataNotFoundError("目标原纸不存在");
    }

    await transactionRepository.updateImportRowMatch({
      batchId,
      rowId,
      targetMaterialId: paperMaterialId,
      rowStatus: "update",
    });

    await transactionRepository.createMatchRule({
      sourceType: batch.sourceType,
      sourceSignature: buildImportRowSourceSignature(batch.sourceType, row.normalizedData),
      paperMaterialId,
      confirmedBy,
    });

    return {
      ok: true,
      data: {
        rowId,
        rowStatus: "update",
        targetMaterialId: paperMaterialId,
      },
    };
  });
}

export async function confirmMasterDataImportBatch(input: {
  repository: MasterDataImportRepository;
  batchId: string;
  confirmedBy: string;
  now?: Date;
}): Promise<ActionResult<ConfirmPaperCodeImportBatchResult>> {
  const batch = await input.repository.findImportBatchById(input.batchId);

  if (batch?.sourceType === "paper_code_table") {
    return confirmPaperCodeImportBatch(input);
  }

  return input.repository.transaction(async (transactionRepository) => {
    const transactionBatch = await transactionRepository.findImportBatchById(input.batchId);

    if (!transactionBatch) {
      return dataNotFoundError("导入批次不存在");
    }

    if (transactionBatch.status !== "previewed") {
      return validationError("该导入批次已确认或不可确认");
    }

    const rows = await transactionRepository.listImportRowsByBatchId(input.batchId);
    const pendingRow = rows.find((row) => row.rowStatus === "pending");

    if (pendingRow) {
      return validationError("请先处理待确认行后再确认入库");
    }

    const summary: ConfirmPaperCodeImportBatchResult = {
      batchId: input.batchId,
      createdFactoryCount: 0,
      createdMaterialCount: 0,
      updatedMaterialCount: 0,
      skippedFailedRowCount: 0,
    };

    if (transactionBatch.sourceType === "paper_price_table") {
      await confirmPaperPriceRows({
        repository: transactionRepository,
        batch: transactionBatch,
        rows,
        summary,
        confirmedBy: input.confirmedBy,
        now: input.now ?? new Date(),
      });
    } else if (transactionBatch.sourceType === "quality_standard_table") {
      await confirmQualityStandardRows({
        repository: transactionRepository,
        batch: transactionBatch,
        rows,
        summary,
        confirmedBy: input.confirmedBy,
        now: input.now ?? new Date(),
      });
    } else {
      return validationError("不支持的导入来源");
    }

    await transactionRepository.markImportBatchConfirmed({
      batchId: input.batchId,
      confirmedBy: input.confirmedBy,
      confirmedAt: input.now ?? new Date(),
    });

    return {
      ok: true,
      data: summary,
    };
  });
}

export function createDrizzleMasterDataImportRepository(
  db: AppDatabase,
): MasterDataImportRepository {
  return new DrizzleMasterDataImportRepository(db);
}

async function confirmPaperPriceRows(input: {
  repository: MasterDataImportRepository;
  batch: MasterDataImportBatchRecord;
  rows: MasterDataImportRowRecord[];
  summary: ConfirmPaperCodeImportBatchResult;
  confirmedBy: string;
  now: Date;
}): Promise<void> {
  for (const row of input.rows) {
    if (row.rowStatus === "failed") {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    if (row.rowStatus !== "update" || !row.targetMaterialId || !isPaperPriceData(row.normalizedData)) {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    const material = await input.repository.findPaperMaterialById(row.targetMaterialId);

    if (!material) {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    const beforeMaterial = clonePaperMaterialRecord(material);

    for (const price of row.normalizedData.prices) {
      await input.repository.createPriceHistory({
        paperMaterialId: material.id,
        priceYuanPerTon: price.priceYuanPerTon,
        effectiveDate: price.effectiveDate,
        sourceFileName: input.batch.fileName,
        sourceSheetName: row.sheetName ?? undefined,
        sourceRowNumber: row.rowNumber,
        importBatchId: input.batch.id,
      });
    }

    const latestPrice = getLatestPaperPrice(row.normalizedData.prices);

    if (!latestPrice) {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    const nextMaterial = {
      ...material,
      priceYuanPerTon: latestPrice.priceYuanPerTon,
    };
    const completeness = calculatePaperMaterialCompleteness({
      paperCode: nextMaterial.paperCode,
      factoryName: nextMaterial.factoryName,
      paperName: nextMaterial.name,
      gramWeightGsm: nextMaterial.gramWeightGsm,
      paperKind: nextMaterial.paperKind,
      priceYuanPerTon: nextMaterial.priceYuanPerTon,
      burstIndex: nextMaterial.burstIndex,
      ringCrushIndex: nextMaterial.ringCrushIndex,
    });
    const updatedMaterial = await input.repository.updatePaperMaterial(material.id, {
      priceYuanPerTon: latestPrice.priceYuanPerTon,
      completenessStatus: completeness.status,
      missingFields: completeness.missingFields,
    });
    const changedFields = buildConfirmedPaperPriceChangeSet(beforeMaterial, updatedMaterial);

    if (Object.keys(changedFields).length > 0) {
      await input.repository.createChangeLog({
        entityType: "paper_material",
        entityId: material.id,
        changeSource: "import",
        importBatchId: input.batch.id,
        changedFields,
        changedBy: input.confirmedBy,
        createdAt: input.now,
      });
    }

    input.summary.updatedMaterialCount += 1;
  }
}

async function confirmQualityStandardRows(input: {
  repository: MasterDataImportRepository;
  batch: MasterDataImportBatchRecord;
  rows: MasterDataImportRowRecord[];
  summary: ConfirmPaperCodeImportBatchResult;
  confirmedBy: string;
  now: Date;
}): Promise<void> {
  for (const row of input.rows) {
    if (row.rowStatus === "failed") {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    if (!isQualityStandardData(row.normalizedData)) {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    await input.repository.createQualityStandard({
      paperKind: row.normalizedData.paperKind,
      grade: row.normalizedData.grade,
      gramWeightMinGsm: row.normalizedData.gramWeightMinGsm,
      gramWeightMaxGsm: row.normalizedData.gramWeightMaxGsm,
      burstIndex: row.normalizedData.burstIndex,
      ringCrushIndex: row.normalizedData.ringCrushIndex,
      rawLabel: row.normalizedData.rawLabel,
      sourceFileName: input.batch.fileName,
      sourceSheetName: row.sheetName ?? "",
    });

    if (row.rowStatus !== "update" || !row.targetMaterialId) {
      continue;
    }

    const material = await input.repository.findPaperMaterialById(row.targetMaterialId);

    if (!material) {
      input.summary.skippedFailedRowCount += 1;
      continue;
    }

    const beforeMaterial = clonePaperMaterialRecord(material);
    const nextMaterial = {
      ...material,
      paperKind: row.normalizedData.paperKind,
      grade: row.normalizedData.grade,
      burstIndex: row.normalizedData.burstIndex ?? material.burstIndex,
      ringCrushIndex: row.normalizedData.ringCrushIndex ?? material.ringCrushIndex,
    };
    const completeness = calculatePaperMaterialCompleteness({
      paperCode: nextMaterial.paperCode,
      factoryName: nextMaterial.factoryName,
      paperName: nextMaterial.name,
      gramWeightGsm: nextMaterial.gramWeightGsm,
      paperKind: nextMaterial.paperKind,
      priceYuanPerTon: nextMaterial.priceYuanPerTon,
      burstIndex: nextMaterial.burstIndex,
      ringCrushIndex: nextMaterial.ringCrushIndex,
    });
    const updatedMaterial = await input.repository.updatePaperMaterial(material.id, {
      paperKind: nextMaterial.paperKind,
      grade: nextMaterial.grade,
      burstIndex: nextMaterial.burstIndex,
      ringCrushIndex: nextMaterial.ringCrushIndex,
      completenessStatus: completeness.status,
      missingFields: completeness.missingFields,
    });
    const changedFields = buildConfirmedQualityChangeSet(beforeMaterial, updatedMaterial);

    if (Object.keys(changedFields).length > 0) {
      await input.repository.createChangeLog({
        entityType: "paper_material",
        entityId: material.id,
        changeSource: "import",
        importBatchId: input.batch.id,
        changedFields,
        changedBy: input.confirmedBy,
        createdAt: input.now,
      });
    }

    input.summary.updatedMaterialCount += 1;
  }
}

async function findPaperCodeConflict(
  repository: MasterDataImportRepository,
  rows: MasterDataImportRowRecord[],
): Promise<ActionResult<null>> {
  for (const row of rows) {
    if (
      row.rowStatus !== "new" ||
      !isPaperCodeData(row.normalizedData) ||
      !row.normalizedData.paperCode
    ) {
      continue;
    }

    const existingMaterial = await repository.findPaperMaterialByCode(row.normalizedData.paperCode);

    if (existingMaterial) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `原纸代码 ${row.normalizedData.paperCode} 已存在，请重新预览后再确认`,
        },
      };
    }
  }

  return { ok: true, data: null };
}

async function findOrCreatePaperFactory(
  repository: MasterDataImportRepository,
  factoryName: string,
): Promise<{ factory: PaperFactoryRecord; created: boolean }> {
  const existingFactory = await repository.findPaperFactoryByName(factoryName);

  if (existingFactory) {
    return { factory: existingFactory, created: false };
  }

  return {
    factory: await repository.createPaperFactory({ name: factoryName }),
    created: true,
  };
}

function buildCreatedPaperMaterialChangeSet(
  material: PaperMaterialRecord,
): MasterDataChangeLogRecord["changedFields"] {
  return {
    paperCode: { before: null, after: material.paperCode },
    paperEncoding: { before: null, after: material.paperEncoding ?? null },
    factoryId: { before: null, after: material.factoryId },
    name: { before: null, after: material.name },
    paperKind: { before: null, after: material.paperKind },
    gramWeightGsm: { before: null, after: material.gramWeightGsm },
    completenessStatus: { before: null, after: material.completenessStatus },
    missingFields: { before: null, after: material.missingFields },
  };
}

function buildConfirmedPaperPriceChangeSet(
  before: PaperMaterialRecord,
  after: PaperMaterialRecord,
): MasterDataChangeLogRecord["changedFields"] {
  const changedFields: MasterDataChangeLogRecord["changedFields"] = {};

  addChangedField(
    changedFields,
    "price_yuan_per_ton",
    before.priceYuanPerTon ?? null,
    after.priceYuanPerTon ?? null,
  );
  addChangedField(
    changedFields,
    "completeness_status",
    before.completenessStatus,
    after.completenessStatus,
  );
  addChangedField(changedFields, "missing_fields", before.missingFields, after.missingFields);

  return changedFields;
}

function buildConfirmedQualityChangeSet(
  before: PaperMaterialRecord,
  after: PaperMaterialRecord,
): MasterDataChangeLogRecord["changedFields"] {
  const changedFields: MasterDataChangeLogRecord["changedFields"] = {};

  addChangedField(changedFields, "paper_kind", before.paperKind, after.paperKind);
  addChangedField(changedFields, "grade", before.grade ?? null, after.grade ?? null);
  addChangedField(
    changedFields,
    "burst_index",
    before.burstIndex ?? null,
    after.burstIndex ?? null,
  );
  addChangedField(
    changedFields,
    "ring_crush_index",
    before.ringCrushIndex ?? null,
    after.ringCrushIndex ?? null,
  );
  addChangedField(
    changedFields,
    "completeness_status",
    before.completenessStatus,
    after.completenessStatus,
  );
  addChangedField(changedFields, "missing_fields", before.missingFields, after.missingFields);

  return changedFields;
}

function buildPaperMaterialChangeSet(
  before: PaperMaterialRecord,
  after: PaperMaterialRecord,
): MasterDataChangeLogRecord["changedFields"] {
  const changedFields: MasterDataChangeLogRecord["changedFields"] = {};

  addChangedField(
    changedFields,
    "paperEncoding",
    before.paperEncoding ?? null,
    after.paperEncoding ?? null,
  );
  addChangedField(changedFields, "factoryId", before.factoryId, after.factoryId);
  addChangedField(changedFields, "name", before.name, after.name);
  addChangedField(changedFields, "paperKind", before.paperKind, after.paperKind);
  addChangedField(changedFields, "gramWeightGsm", before.gramWeightGsm, after.gramWeightGsm);
  addChangedField(
    changedFields,
    "completenessStatus",
    before.completenessStatus,
    after.completenessStatus,
  );
  addChangedField(changedFields, "missingFields", before.missingFields, after.missingFields);

  return changedFields;
}

function addChangedField(
  changedFields: MasterDataChangeLogRecord["changedFields"],
  field: string,
  before: unknown,
  after: unknown,
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  changedFields[field] = { before, after };
}

function clonePaperMaterialRecord(material: PaperMaterialRecord): PaperMaterialRecord {
  return {
    ...material,
    applicableFlutes: [...material.applicableFlutes],
    missingFields: [...material.missingFields],
  };
}

function buildImportRowSourceSignature(sourceType: string, normalizedData: MasterDataNormalizedData): string {
  if (sourceType === "paper_price_table" && isPaperPriceData(normalizedData)) {
    return buildPaperPriceSourceSignature(normalizedData);
  }

  if (sourceType === "quality_standard_table" && isQualityStandardData(normalizedData)) {
    return [
      sourceType,
      normalizedData.paperKind,
      normalizedData.grade ?? "",
      normalizedData.gramWeightMinGsm?.toString() ?? "",
      normalizedData.gramWeightMaxGsm?.toString() ?? "",
    ].join("|");
  }

  return `${sourceType}|${JSON.stringify(normalizedData)}`;
}

function getLatestPaperPrice(prices: PaperPriceEntry[]): PaperPriceEntry | undefined {
  return [...prices].sort(comparePaperPriceByEffectiveDate).at(-1);
}

function comparePaperPriceByEffectiveDate(left: PaperPriceEntry, right: PaperPriceEntry): number {
  return getPaperPriceEffectiveDateSortValue(left.effectiveDate) -
    getPaperPriceEffectiveDateSortValue(right.effectiveDate);
}

function getPaperPriceEffectiveDateSortValue(effectiveDate: string | undefined): number {
  if (!effectiveDate) {
    return 0;
  }

  return Number(effectiveDate.replace("-", ""));
}

function isPaperPriceData(value: MasterDataNormalizedData): value is PaperPriceNormalizedData {
  return "prices" in value;
}

function isPaperCodeData(value: MasterDataNormalizedData): value is PaperCodeNormalizedData {
  return "paperCode" in value || "supplierShortName" in value;
}

function isQualityStandardData(
  value: MasterDataNormalizedData,
): value is QualityStandardNormalizedData {
  return "scope" in value && value.scope === "paper_kind_standard";
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

function dataNotFoundError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "DATA_NOT_FOUND",
      message,
    },
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toPaperMaterialRecord(material: typeof paperMaterials.$inferSelect): PaperMaterialRecord {
  return {
    id: material.id,
    paperCode: material.paperCode,
    paperEncoding: material.paperEncoding ?? undefined,
    factoryId: material.factoryId,
    name: material.name,
    paperKind: material.paperKind,
    grade: material.grade ?? undefined,
    gramWeightGsm: material.gramWeightGsm,
    usage: material.usage ?? undefined,
    applicableFlutes: toStringArray(material.applicableFlutes),
    priceYuanPerTon: toNumberOrUndefined(material.priceYuanPerTon),
    burstIndex: toNumberOrUndefined(material.burstIndex),
    ringCrushIndex: toNumberOrUndefined(material.ringCrushIndex),
    completenessStatus: material.completenessStatus === "complete" ? "complete" : "incomplete",
    missingFields: toStringArray(material.missingFields),
    isActive: material.isActive,
  };
}

function toPaperMaterialPriceHistoryRecord(
  history: typeof paperMaterialPriceHistories.$inferSelect,
): PaperMaterialPriceHistoryRecord {
  return {
    id: history.id,
    paperMaterialId: history.paperMaterialId,
    priceYuanPerTon: Number(history.priceYuanPerTon),
    effectiveDate: history.effectiveDate ?? undefined,
    sourceFileName: history.sourceFileName,
    sourceSheetName: history.sourceSheetName ?? undefined,
    sourceRowNumber: history.sourceRowNumber ?? undefined,
    importBatchId: history.importBatchId ?? undefined,
    createdAt: history.createdAt,
  };
}

function toPaperQualityStandardRecord(
  standard: typeof paperQualityStandards.$inferSelect,
): PaperQualityStandardRecord {
  return {
    id: standard.id,
    paperKind: standard.paperKind,
    grade: standard.grade ?? undefined,
    gramWeightMinGsm: standard.gramWeightMinGsm ?? undefined,
    gramWeightMaxGsm: standard.gramWeightMaxGsm ?? undefined,
    burstIndex: toNumberOrUndefined(standard.burstIndex),
    ringCrushIndex: toNumberOrUndefined(standard.ringCrushIndex),
    rawLabel: standard.rawLabel,
    sourceFileName: standard.sourceFileName,
    sourceSheetName: standard.sourceSheetName,
    createdAt: standard.createdAt,
  };
}

function toPaperMaterialMatchRuleRecord(
  rule: typeof paperMaterialMatchRules.$inferSelect,
): PaperMaterialMatchRuleRecord {
  return {
    id: rule.id,
    sourceType: rule.sourceType,
    sourceSignature: rule.sourceSignature,
    paperMaterialId: rule.paperMaterialId,
    confirmedBy: rule.confirmedBy,
    createdAt: rule.createdAt,
  };
}

class DrizzleMasterDataImportRepository implements MasterDataImportRepository {
  constructor(private readonly db: AppDatabase) {}

  async transaction<T>(run: (repository: MasterDataImportRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => run(new DrizzleMasterDataImportRepository(tx)));
  }

  async listPaperMaterialsForPreview(): Promise<PaperMaterialRecord[]> {
    const rows = await this.db
      .select({
        material: paperMaterials,
        factoryName: paperFactories.name,
      })
      .from(paperMaterials)
      .leftJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id));

    return rows.map((row) => ({
      ...toPaperMaterialRecord(row.material),
      factoryName: row.factoryName ?? undefined,
    }));
  }

  async saveImportPreview(input: {
    sourceType: string;
    fileName: string;
    summary: MasterDataImportSummary;
    rows: Array<Omit<MasterDataImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }> {
    const [batch] = await this.db
      .insert(masterDataImportBatches)
      .values({
        sourceType: input.sourceType,
        fileName: input.fileName,
        status: "previewed",
        summary: input.summary,
        createdBy: input.createdBy,
      })
      .returning({ id: masterDataImportBatches.id });

    if (!batch) {
      throw new Error("failed to create import batch");
    }

    if (input.rows.length > 0) {
      await this.db.insert(masterDataImportRows).values(
        input.rows.map((row) => ({
          batchId: batch.id,
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          rowStatus: row.rowStatus,
          rawData: row.rawData,
          normalizedData: row.normalizedData,
          targetMaterialId: row.targetMaterialId,
          candidateMaterialIds: row.candidateMaterialIds,
          changeSet: row.changeSet,
          errors: row.errors,
        })),
      );
    }

    return { batchId: batch.id };
  }

  async findImportBatchById(batchId: string): Promise<MasterDataImportBatchRecord | undefined> {
    const [batch] = await this.db
      .select()
      .from(masterDataImportBatches)
      .where(eq(masterDataImportBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return undefined;
    }

    return {
      id: batch.id,
      sourceType: batch.sourceType,
      fileName: batch.fileName,
      status: batch.status as MasterDataImportBatchStatus,
      summary: batch.summary as MasterDataImportSummary,
      createdBy: batch.createdBy,
      confirmedBy: batch.confirmedBy ?? undefined,
      createdAt: batch.createdAt,
      confirmedAt: batch.confirmedAt ?? undefined,
    };
  }

  async listImportRowsByBatchId(batchId: string): Promise<MasterDataImportRowRecord[]> {
    const rows = await this.db
      .select()
      .from(masterDataImportRows)
      .where(eq(masterDataImportRows.batchId, batchId));

    return rows.map((row) => ({
      id: row.id,
      batchId: row.batchId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus as MasterDataImportRowStatus,
      rawData: row.rawData as Record<string, string>,
      normalizedData: row.normalizedData as MasterDataNormalizedData,
      targetMaterialId: row.targetMaterialId ?? undefined,
      candidateMaterialIds: toStringArray(row.candidateMaterialIds),
      changeSet: row.changeSet as Record<string, unknown>,
      errors: Array.isArray(row.errors) ? (row.errors as ImportFieldIssue[]) : [],
    }));
  }

  async findImportRowById(input: {
    batchId: string;
    rowId: string;
  }): Promise<MasterDataImportRowRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(masterDataImportRows)
      .where(and(eq(masterDataImportRows.batchId, input.batchId), eq(masterDataImportRows.id, input.rowId)))
      .limit(1);

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      batchId: row.batchId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus as MasterDataImportRowStatus,
      rawData: row.rawData as Record<string, string>,
      normalizedData: row.normalizedData as MasterDataNormalizedData,
      targetMaterialId: row.targetMaterialId ?? undefined,
      candidateMaterialIds: toStringArray(row.candidateMaterialIds),
      changeSet: row.changeSet as Record<string, unknown>,
      errors: Array.isArray(row.errors) ? (row.errors as ImportFieldIssue[]) : [],
    };
  }

  async updateImportRowMatch(input: {
    batchId: string;
    rowId: string;
    targetMaterialId: string;
    rowStatus: "update";
  }): Promise<MasterDataImportRowRecord> {
    const [row] = await this.db
      .update(masterDataImportRows)
      .set({
        rowStatus: input.rowStatus,
        targetMaterialId: input.targetMaterialId,
        errors: [],
      })
      .where(and(eq(masterDataImportRows.batchId, input.batchId), eq(masterDataImportRows.id, input.rowId)))
      .returning();

    if (!row) {
      throw new Error("import row not found");
    }

    return {
      id: row.id,
      batchId: row.batchId,
      sheetName: row.sheetName,
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus as MasterDataImportRowStatus,
      rawData: row.rawData as Record<string, string>,
      normalizedData: row.normalizedData as MasterDataNormalizedData,
      targetMaterialId: row.targetMaterialId ?? undefined,
      candidateMaterialIds: toStringArray(row.candidateMaterialIds),
      changeSet: row.changeSet as Record<string, unknown>,
      errors: Array.isArray(row.errors) ? (row.errors as ImportFieldIssue[]) : [],
    };
  }

  async findPaperMaterialById(id: string): Promise<PaperMaterialRecord | undefined> {
    const [material] = await this.db
      .select()
      .from(paperMaterials)
      .where(eq(paperMaterials.id, id))
      .limit(1);

    return material ? toPaperMaterialRecord(material) : undefined;
  }

  async findPaperMaterialByCode(paperCode: string): Promise<PaperMaterialRecord | undefined> {
    const [material] = await this.db
      .select()
      .from(paperMaterials)
      .where(eq(paperMaterials.paperCode, paperCode))
      .limit(1);

    return material ? toPaperMaterialRecord(material) : undefined;
  }

  async findPaperFactoryByName(name: string): Promise<PaperFactoryRecord | undefined> {
    const [factory] = await this.db
      .select()
      .from(paperFactories)
      .where(eq(paperFactories.name, name))
      .limit(1);

    if (!factory) {
      return undefined;
    }

    return {
      id: factory.id,
      name: factory.name,
      supplyTypes: toStringArray(factory.supplyTypes),
      isActive: factory.isActive,
    };
  }

  async createPaperFactory(input: { name: string }): Promise<PaperFactoryRecord> {
    const [factory] = await this.db
      .insert(paperFactories)
      .values({
        name: input.name,
      })
      .returning();

    if (!factory) {
      throw new Error("failed to create paper factory");
    }

    return {
      id: factory.id,
      name: factory.name,
      supplyTypes: toStringArray(factory.supplyTypes),
      isActive: factory.isActive,
    };
  }

  async createPaperMaterial(
    input: Omit<PaperMaterialRecord, "id" | "factoryName">,
  ): Promise<PaperMaterialRecord> {
    const [material] = await this.db
      .insert(paperMaterials)
      .values({
        paperCode: input.paperCode,
        paperEncoding: input.paperEncoding,
        factoryId: input.factoryId,
        name: input.name,
        paperKind: input.paperKind,
        grade: input.grade,
        gramWeightGsm: input.gramWeightGsm,
        usage: input.usage,
        applicableFlutes: input.applicableFlutes,
        priceYuanPerTon: input.priceYuanPerTon?.toString(),
        burstIndex: input.burstIndex?.toString(),
        ringCrushIndex: input.ringCrushIndex?.toString(),
        completenessStatus: input.completenessStatus,
        missingFields: input.missingFields,
        isActive: input.isActive,
      })
      .returning();

    if (!material) {
      throw new Error("failed to create paper material");
    }

    return toPaperMaterialRecord(material);
  }

  async updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialRecord, "id">>,
  ): Promise<PaperMaterialRecord> {
    const [material] = await this.db
      .update(paperMaterials)
      .set({
        paperEncoding: input.paperEncoding,
        factoryId: input.factoryId,
        name: input.name,
        paperKind: input.paperKind,
        grade: input.grade,
        gramWeightGsm: input.gramWeightGsm,
        usage: input.usage,
        applicableFlutes: input.applicableFlutes,
        priceYuanPerTon: input.priceYuanPerTon?.toString(),
        burstIndex: input.burstIndex?.toString(),
        ringCrushIndex: input.ringCrushIndex?.toString(),
        completenessStatus: input.completenessStatus,
        missingFields: input.missingFields,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(eq(paperMaterials.id, id))
      .returning();

    if (!material) {
      throw new Error("paper material not found");
    }

    return toPaperMaterialRecord(material);
  }

  async createMatchRule(
    input: Omit<PaperMaterialMatchRuleRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialMatchRuleRecord> {
    const [rule] = await this.db
      .insert(paperMaterialMatchRules)
      .values({
        sourceType: input.sourceType,
        sourceSignature: input.sourceSignature,
        paperMaterialId: input.paperMaterialId,
        confirmedBy: input.confirmedBy,
      })
      .returning();

    if (!rule) {
      throw new Error("failed to create match rule");
    }

    return toPaperMaterialMatchRuleRecord(rule);
  }

  async createPriceHistory(
    input: Omit<PaperMaterialPriceHistoryRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialPriceHistoryRecord> {
    const [history] = await this.db
      .insert(paperMaterialPriceHistories)
      .values({
        paperMaterialId: input.paperMaterialId,
        priceYuanPerTon: input.priceYuanPerTon.toString(),
        effectiveDate: input.effectiveDate,
        sourceFileName: input.sourceFileName,
        sourceSheetName: input.sourceSheetName,
        sourceRowNumber: input.sourceRowNumber,
        importBatchId: input.importBatchId,
      })
      .returning();

    if (!history) {
      throw new Error("failed to create price history");
    }

    return toPaperMaterialPriceHistoryRecord(history);
  }

  async createQualityStandard(
    input: Omit<PaperQualityStandardRecord, "id" | "createdAt">,
  ): Promise<PaperQualityStandardRecord> {
    const [standard] = await this.db
      .insert(paperQualityStandards)
      .values({
        paperKind: input.paperKind,
        grade: input.grade,
        gramWeightMinGsm: input.gramWeightMinGsm,
        gramWeightMaxGsm: input.gramWeightMaxGsm,
        burstIndex: input.burstIndex?.toString(),
        ringCrushIndex: input.ringCrushIndex?.toString(),
        rawLabel: input.rawLabel,
        sourceFileName: input.sourceFileName,
        sourceSheetName: input.sourceSheetName,
      })
      .returning();

    if (!standard) {
      throw new Error("failed to create quality standard");
    }

    return toPaperQualityStandardRecord(standard);
  }

  async createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void> {
    await this.db.insert(masterDataChangeLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      changeSource: input.changeSource,
      importBatchId: input.importBatchId,
      changedFields: input.changedFields,
      reason: input.reason,
      changedBy: input.changedBy,
      createdAt: input.createdAt,
    });
  }

  async markImportBatchConfirmed(input: {
    batchId: string;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void> {
    await this.db
      .update(masterDataImportBatches)
      .set({
        status: "confirmed",
        confirmedBy: input.confirmedBy,
        confirmedAt: input.confirmedAt,
      })
      .where(eq(masterDataImportBatches.id, input.batchId));
  }

  async listChangeLogs(input: {
    entityType: MasterDataEntityType;
    entityId: string;
  }): Promise<MasterDataChangeLogRecord[]> {
    const rows = await this.db
      .select()
      .from(masterDataChangeLogs)
      .where(
        and(
          eq(masterDataChangeLogs.entityType, input.entityType),
          eq(masterDataChangeLogs.entityId, input.entityId),
        ),
      )
      .orderBy(desc(masterDataChangeLogs.createdAt));

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType as MasterDataEntityType,
      entityId: row.entityId,
      changeSource: row.changeSource as MasterDataChangeSource,
      importBatchId: row.importBatchId ?? undefined,
      changedFields: row.changedFields as MasterDataChangeLogRecord["changedFields"],
      reason: row.reason ?? undefined,
      changedBy: row.changedBy,
      createdAt: row.createdAt,
    }));
  }
}
