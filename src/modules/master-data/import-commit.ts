import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  masterDataChangeLogs,
  masterDataImportBatches,
  masterDataImportRows,
  paperFactories,
  paperMaterials,
} from "@/db/schema";
import type * as schema from "@/db/schema";
import type {
  ImportFieldIssue,
  PaperCodeNormalizedData,
} from "@/modules/import-export/master-data-workbook-parser";
import { calculatePaperMaterialCompleteness } from "@/modules/master-data/completeness";
import type {
  ExistingPaperMaterialForPreview,
  PaperCodeImportPreview,
} from "@/modules/master-data/import-preview";
import type { ActionResult } from "@/shared/types/action-result";

export type MasterDataImportBatchStatus = "previewed" | "confirmed" | "cancelled" | "failed";
export type MasterDataImportRowStatus = "new" | "update" | "pending" | "failed";
export type MasterDataEntityType = "paper_factory" | "paper_material";
export type MasterDataChangeSource = "import" | "manual";

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
  normalizedData: PaperCodeNormalizedData;
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

export interface MasterDataImportRepository {
  transaction<T>(run: (repository: MasterDataImportRepository) => Promise<T>): Promise<T>;
  listPaperMaterialsForPreview(): Promise<ExistingPaperMaterialForPreview[]>;
  saveImportPreview(input: {
    sourceType: string;
    fileName: string;
    summary: MasterDataImportSummary;
    rows: Array<Omit<MasterDataImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }>;
  findImportBatchById(batchId: string): Promise<MasterDataImportBatchRecord | undefined>;
  listImportRowsByBatchId(batchId: string): Promise<MasterDataImportRowRecord[]>;
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

type AppDatabase = NodePgDatabase<typeof schema>;

export async function savePaperCodeImportPreview({
  repository,
  preview,
  sourceType,
  fileName,
  createdBy,
}: SavePaperCodeImportPreviewInput): Promise<{ batchId: string }> {
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
      candidateMaterialIds: [],
      changeSet: {
        completenessStatus: row.completenessStatus,
        missingFields: row.missingFields,
        warnings: row.warnings,
      },
      errors: row.errors,
    })),
  });
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

export function createDrizzleMasterDataImportRepository(
  db: AppDatabase,
): MasterDataImportRepository {
  return new DrizzleMasterDataImportRepository(db);
}

async function findPaperCodeConflict(
  repository: MasterDataImportRepository,
  rows: MasterDataImportRowRecord[],
): Promise<ActionResult<null>> {
  for (const row of rows) {
    if (row.rowStatus !== "new" || !row.normalizedData.paperCode) {
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

class DrizzleMasterDataImportRepository implements MasterDataImportRepository {
  constructor(private readonly db: AppDatabase) {}

  async transaction<T>(run: (repository: MasterDataImportRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => run(new DrizzleMasterDataImportRepository(tx)));
  }

  async listPaperMaterialsForPreview(): Promise<ExistingPaperMaterialForPreview[]> {
    return this.db
      .select({
        id: paperMaterials.id,
        paperCode: paperMaterials.paperCode,
      })
      .from(paperMaterials);
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
      normalizedData: row.normalizedData as PaperCodeNormalizedData,
      targetMaterialId: row.targetMaterialId ?? undefined,
      candidateMaterialIds: toStringArray(row.candidateMaterialIds),
      changeSet: row.changeSet as Record<string, unknown>,
      errors: Array.isArray(row.errors) ? (row.errors as ImportFieldIssue[]) : [],
    }));
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
