import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { masterDataChangeLogs, paperFactories, paperMaterials } from "@/db/schema";
import type * as schema from "@/db/schema";
import { calculatePaperMaterialCompleteness } from "@/modules/master-data/completeness";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type { ActionResult } from "@/shared/types/action-result";

type AppDatabase = NodePgDatabase<typeof schema>;

export type UpdatePaperMaterialCompletenessStatus = "complete" | "incomplete";

export interface PaperMaterialForUpdate {
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
  completenessStatus: UpdatePaperMaterialCompletenessStatus;
  missingFields: string[];
  isActive: boolean;
}

export interface UpdatePaperMaterialPatch {
  paperCode?: string | undefined;
  paperEncoding?: string | undefined;
  name?: string | undefined;
  paperKind?: string | undefined;
  grade?: string | undefined;
  gramWeightGsm?: number | undefined;
  usage?: string | undefined;
  applicableFlutes?: string[] | undefined;
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  isActive?: boolean | undefined;
}

export interface UpdatePaperMaterialInput {
  paperMaterialId: string;
  patch: UpdatePaperMaterialPatch;
  reason?: string | undefined;
}

export interface UpdatePaperMaterialResult {
  paperMaterialId: string;
  changedFields: MasterDataChangeLogRecord["changedFields"];
  completenessStatus: UpdatePaperMaterialCompletenessStatus;
  missingFields: string[];
}

export interface UpdatePaperMaterialRepository {
  transaction<T>(run: (repository: UpdatePaperMaterialRepository) => Promise<T>): Promise<T>;
  findPaperMaterialById(id: string): Promise<PaperMaterialForUpdate | undefined>;
  findPaperMaterialByCode(paperCode: string): Promise<PaperMaterialForUpdate | undefined>;
  updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialForUpdate, "id" | "factoryName">>,
  ): Promise<PaperMaterialForUpdate>;
  createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void>;
}

type EditableFieldName = keyof UpdatePaperMaterialPatch;

const editableFieldNames = [
  "paperCode",
  "paperEncoding",
  "name",
  "paperKind",
  "grade",
  "gramWeightGsm",
  "usage",
  "applicableFlutes",
  "priceYuanPerTon",
  "burstIndex",
  "ringCrushIndex",
  "isActive",
] as const satisfies readonly EditableFieldName[];

const importantFields = new Set<EditableFieldName>([
  "paperKind",
  "gramWeightGsm",
  "usage",
  "applicableFlutes",
  "priceYuanPerTon",
  "burstIndex",
  "ringCrushIndex",
  "isActive",
]);

const databaseFieldNames: Record<EditableFieldName, string> = {
  paperCode: "paper_code",
  paperEncoding: "paper_encoding",
  name: "name",
  paperKind: "paper_kind",
  grade: "grade",
  gramWeightGsm: "gram_weight_gsm",
  usage: "usage",
  applicableFlutes: "applicable_flutes",
  priceYuanPerTon: "price_yuan_per_ton",
  burstIndex: "burst_index",
  ringCrushIndex: "ring_crush_index",
  isActive: "is_active",
};

export async function updatePaperMaterialFromRepository({
  repository,
  input,
  updatedBy,
  now = new Date(),
}: {
  repository: UpdatePaperMaterialRepository;
  input: UpdatePaperMaterialInput;
  updatedBy: string;
  now?: Date | undefined;
}): Promise<ActionResult<UpdatePaperMaterialResult>> {
  if (!input.paperMaterialId.trim()) {
    return validationError("原纸资料不能为空");
  }

  return repository.transaction(async (transactionRepository) => {
    const currentMaterial = await transactionRepository.findPaperMaterialById(input.paperMaterialId);

    if (!currentMaterial) {
      return validationError("原纸资料不存在");
    }

    const normalizedPatch = normalizePatch(input.patch);
    const paperCodeValidationResult = await validatePaperCode({
      repository: transactionRepository,
      currentMaterial,
      patch: normalizedPatch,
    });

    if (!paperCodeValidationResult.ok) {
      return paperCodeValidationResult;
    }

    const nextMaterial = buildNextMaterial(currentMaterial, normalizedPatch);
    const requiredFieldValidationResult = validateRequiredFields(nextMaterial);

    if (!requiredFieldValidationResult.ok) {
      return requiredFieldValidationResult;
    }

    const changedFields = collectChangedFields(currentMaterial, nextMaterial, normalizedPatch);

    if (Object.keys(changedFields).length === 0) {
      return {
        ok: true,
        data: {
          paperMaterialId: currentMaterial.id,
          changedFields,
          completenessStatus: currentMaterial.completenessStatus,
          missingFields: currentMaterial.missingFields,
        },
      };
    }

    const importantChangedFields = getImportantChangedFields(changedFields);
    const reason = input.reason?.trim() || undefined;

    if (importantChangedFields.length > 0 && !reason) {
      return validationError("修改纸价、克重、用途、适用瓦型、强度指标或启用状态时需要填写修改原因");
    }

    const completeness = calculatePaperMaterialCompleteness({
      paperCode: nextMaterial.paperCode,
      factoryName: nextMaterial.factoryName,
      paperName: nextMaterial.name,
      gramWeightGsm: nextMaterial.gramWeightGsm,
      paperKind: nextMaterial.paperKind,
      priceYuanPerTon: nextMaterial.priceYuanPerTon,
      burstIndex: nextMaterial.burstIndex,
      ringCrushIndex: nextMaterial.ringCrushIndex,
      usage: nextMaterial.usage,
      applicableFlutes: nextMaterial.applicableFlutes,
    });

    await transactionRepository.updatePaperMaterial(currentMaterial.id, {
      ...pickUpdateFields(nextMaterial, normalizedPatch),
      completenessStatus: completeness.status,
      missingFields: completeness.missingFields,
    });

    await transactionRepository.createChangeLog({
      entityType: "paper_material",
      entityId: currentMaterial.id,
      changeSource: "manual",
      changedFields,
      ...(reason !== undefined ? { reason } : {}),
      changedBy: updatedBy,
      createdAt: now,
    });

    return {
      ok: true,
      data: {
        paperMaterialId: currentMaterial.id,
        changedFields,
        completenessStatus: completeness.status,
        missingFields: completeness.missingFields,
      },
    };
  });
}

export function createDrizzleUpdatePaperMaterialRepository(
  db: AppDatabase,
): UpdatePaperMaterialRepository {
  return new DrizzleUpdatePaperMaterialRepository(db);
}

function normalizePatch(patch: UpdatePaperMaterialPatch): UpdatePaperMaterialPatch {
  return {
    ...patch,
    ...(patch.paperCode !== undefined ? { paperCode: normalizeRequiredText(patch.paperCode) } : {}),
    ...(patch.paperEncoding !== undefined
      ? { paperEncoding: normalizeOptionalText(patch.paperEncoding) }
      : {}),
    ...(patch.name !== undefined ? { name: normalizeRequiredText(patch.name) } : {}),
    ...(patch.paperKind !== undefined ? { paperKind: normalizeRequiredText(patch.paperKind) } : {}),
    ...(patch.grade !== undefined ? { grade: normalizeOptionalText(patch.grade) } : {}),
    ...(patch.usage !== undefined ? { usage: normalizeOptionalText(patch.usage) } : {}),
  };
}

function normalizeRequiredText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}

async function validatePaperCode({
  repository,
  currentMaterial,
  patch,
}: {
  repository: UpdatePaperMaterialRepository;
  currentMaterial: PaperMaterialForUpdate;
  patch: UpdatePaperMaterialPatch;
}): Promise<ActionResult<null>> {
  if (!patch.paperCode || patch.paperCode === currentMaterial.paperCode) {
    return { ok: true, data: null };
  }

  const duplicateMaterial = await repository.findPaperMaterialByCode(patch.paperCode);

  if (duplicateMaterial && duplicateMaterial.id !== currentMaterial.id) {
    return validationError("原纸代码重复，请换一个原纸代码");
  }

  return { ok: true, data: null };
}

function validateRequiredFields(material: PaperMaterialForUpdate): ActionResult<null> {
  if (!material.paperCode.trim()) {
    return validationError("原纸代码不能为空");
  }

  if (!material.name.trim()) {
    return validationError("原纸名称不能为空");
  }

  if (!material.paperKind.trim()) {
    return validationError("纸类不能为空");
  }

  if (!Number.isFinite(material.gramWeightGsm) || material.gramWeightGsm <= 0) {
    return validationError("克重必须大于 0");
  }

  return { ok: true, data: null };
}

function buildNextMaterial(
  currentMaterial: PaperMaterialForUpdate,
  patch: UpdatePaperMaterialPatch,
): PaperMaterialForUpdate {
  return {
    ...currentMaterial,
    paperCode: patch.paperCode ?? currentMaterial.paperCode,
    paperEncoding:
      "paperEncoding" in patch ? patch.paperEncoding : currentMaterial.paperEncoding,
    name: patch.name ?? currentMaterial.name,
    paperKind: patch.paperKind ?? currentMaterial.paperKind,
    grade: "grade" in patch ? patch.grade : currentMaterial.grade,
    gramWeightGsm: patch.gramWeightGsm ?? currentMaterial.gramWeightGsm,
    usage: "usage" in patch ? patch.usage : currentMaterial.usage,
    applicableFlutes: patch.applicableFlutes ?? currentMaterial.applicableFlutes,
    priceYuanPerTon:
      "priceYuanPerTon" in patch ? patch.priceYuanPerTon : currentMaterial.priceYuanPerTon,
    burstIndex: "burstIndex" in patch ? patch.burstIndex : currentMaterial.burstIndex,
    ringCrushIndex:
      "ringCrushIndex" in patch ? patch.ringCrushIndex : currentMaterial.ringCrushIndex,
    isActive: patch.isActive ?? currentMaterial.isActive,
  };
}

function collectChangedFields(
  before: PaperMaterialForUpdate,
  after: PaperMaterialForUpdate,
  patch: UpdatePaperMaterialPatch,
): MasterDataChangeLogRecord["changedFields"] {
  return editableFieldNames.reduce<MasterDataChangeLogRecord["changedFields"]>((changes, field) => {
    if (!(field in patch)) {
      return changes;
    }

    const beforeValue = before[field];
    const afterValue = after[field];

    if (areEqualValues(beforeValue, afterValue)) {
      return changes;
    }

    changes[databaseFieldNames[field]] = {
      before: beforeValue ?? null,
      after: afterValue ?? null,
    };

    return changes;
  }, {});
}

function areEqualValues(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }

  return left === right;
}

function getImportantChangedFields(
  changedFields: MasterDataChangeLogRecord["changedFields"],
): string[] {
  return editableFieldNames
    .filter((field) => importantFields.has(field))
    .map((field) => databaseFieldNames[field])
    .filter((field) => field in changedFields);
}

function pickUpdateFields(
  nextMaterial: PaperMaterialForUpdate,
  patch: UpdatePaperMaterialPatch,
): Partial<Omit<PaperMaterialForUpdate, "id" | "factoryName">> {
  return editableFieldNames.reduce<Partial<Omit<PaperMaterialForUpdate, "id" | "factoryName">>>(
    (fields, field) => {
      if (field in patch) {
        fields[field] = nextMaterial[field] as never;
      }

      return fields;
    },
    {},
  );
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

interface DrizzlePaperMaterialForUpdateRow {
  id: string;
  paperCode: string;
  paperEncoding: string | null;
  factoryId: string;
  factoryName: string | null;
  name: string;
  paperKind: string;
  grade: string | null;
  gramWeightGsm: number;
  usage: string | null;
  applicableFlutes: unknown;
  priceYuanPerTon: string | null;
  burstIndex: string | null;
  ringCrushIndex: string | null;
  completenessStatus: string;
  missingFields: unknown;
  isActive: boolean;
}

function toPaperMaterialForUpdate(row: DrizzlePaperMaterialForUpdateRow): PaperMaterialForUpdate {
  return {
    id: row.id,
    paperCode: row.paperCode,
    paperEncoding: row.paperEncoding ?? undefined,
    factoryId: row.factoryId,
    factoryName: row.factoryName ?? undefined,
    name: row.name,
    paperKind: row.paperKind,
    grade: row.grade ?? undefined,
    gramWeightGsm: row.gramWeightGsm,
    usage: row.usage ?? undefined,
    applicableFlutes: toStringArray(row.applicableFlutes),
    priceYuanPerTon: toNumberOrUndefined(row.priceYuanPerTon),
    burstIndex: toNumberOrUndefined(row.burstIndex),
    ringCrushIndex: toNumberOrUndefined(row.ringCrushIndex),
    completenessStatus: row.completenessStatus === "complete" ? "complete" : "incomplete",
    missingFields: toStringArray(row.missingFields),
    isActive: row.isActive,
  };
}

class DrizzleUpdatePaperMaterialRepository implements UpdatePaperMaterialRepository {
  constructor(private readonly db: AppDatabase) {}

  async transaction<T>(
    run: (repository: UpdatePaperMaterialRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => run(new DrizzleUpdatePaperMaterialRepository(tx)));
  }

  async findPaperMaterialById(id: string): Promise<PaperMaterialForUpdate | undefined> {
    const [material] = await this.db
      .select({
        id: paperMaterials.id,
        paperCode: paperMaterials.paperCode,
        paperEncoding: paperMaterials.paperEncoding,
        factoryId: paperMaterials.factoryId,
        factoryName: paperFactories.name,
        name: paperMaterials.name,
        paperKind: paperMaterials.paperKind,
        grade: paperMaterials.grade,
        gramWeightGsm: paperMaterials.gramWeightGsm,
        usage: paperMaterials.usage,
        applicableFlutes: paperMaterials.applicableFlutes,
        priceYuanPerTon: paperMaterials.priceYuanPerTon,
        burstIndex: paperMaterials.burstIndex,
        ringCrushIndex: paperMaterials.ringCrushIndex,
        completenessStatus: paperMaterials.completenessStatus,
        missingFields: paperMaterials.missingFields,
        isActive: paperMaterials.isActive,
      })
      .from(paperMaterials)
      .innerJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(eq(paperMaterials.id, id))
      .limit(1);

    return material ? toPaperMaterialForUpdate(material) : undefined;
  }

  async findPaperMaterialByCode(paperCode: string): Promise<PaperMaterialForUpdate | undefined> {
    const [material] = await this.db
      .select({
        id: paperMaterials.id,
        paperCode: paperMaterials.paperCode,
        paperEncoding: paperMaterials.paperEncoding,
        factoryId: paperMaterials.factoryId,
        factoryName: paperFactories.name,
        name: paperMaterials.name,
        paperKind: paperMaterials.paperKind,
        grade: paperMaterials.grade,
        gramWeightGsm: paperMaterials.gramWeightGsm,
        usage: paperMaterials.usage,
        applicableFlutes: paperMaterials.applicableFlutes,
        priceYuanPerTon: paperMaterials.priceYuanPerTon,
        burstIndex: paperMaterials.burstIndex,
        ringCrushIndex: paperMaterials.ringCrushIndex,
        completenessStatus: paperMaterials.completenessStatus,
        missingFields: paperMaterials.missingFields,
        isActive: paperMaterials.isActive,
      })
      .from(paperMaterials)
      .innerJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(eq(paperMaterials.paperCode, paperCode))
      .limit(1);

    return material ? toPaperMaterialForUpdate(material) : undefined;
  }

  async updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialForUpdate, "id" | "factoryName">>,
  ): Promise<PaperMaterialForUpdate> {
    const [material] = await this.db
      .update(paperMaterials)
      .set({
        ...(input.paperCode !== undefined ? { paperCode: input.paperCode } : {}),
        ...("paperEncoding" in input ? { paperEncoding: input.paperEncoding ?? null } : {}),
        ...(input.factoryId !== undefined ? { factoryId: input.factoryId } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.paperKind !== undefined ? { paperKind: input.paperKind } : {}),
        ...("grade" in input ? { grade: input.grade ?? null } : {}),
        ...(input.gramWeightGsm !== undefined ? { gramWeightGsm: input.gramWeightGsm } : {}),
        ...("usage" in input ? { usage: input.usage ?? null } : {}),
        ...(input.applicableFlutes !== undefined
          ? { applicableFlutes: input.applicableFlutes }
          : {}),
        ...("priceYuanPerTon" in input
          ? { priceYuanPerTon: input.priceYuanPerTon?.toString() ?? null }
          : {}),
        ...("burstIndex" in input
          ? { burstIndex: input.burstIndex?.toString() ?? null }
          : {}),
        ...("ringCrushIndex" in input
          ? { ringCrushIndex: input.ringCrushIndex?.toString() ?? null }
          : {}),
        ...(input.completenessStatus !== undefined
          ? { completenessStatus: input.completenessStatus }
          : {}),
        ...(input.missingFields !== undefined ? { missingFields: input.missingFields } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedAt: new Date(),
      })
      .where(eq(paperMaterials.id, id))
      .returning({ id: paperMaterials.id });

    if (!material) {
      throw new Error("paper material not found");
    }

    const [materialWithFactory] = await this.db
      .select({
        id: paperMaterials.id,
        paperCode: paperMaterials.paperCode,
        paperEncoding: paperMaterials.paperEncoding,
        factoryId: paperMaterials.factoryId,
        factoryName: paperFactories.name,
        name: paperMaterials.name,
        paperKind: paperMaterials.paperKind,
        grade: paperMaterials.grade,
        gramWeightGsm: paperMaterials.gramWeightGsm,
        usage: paperMaterials.usage,
        applicableFlutes: paperMaterials.applicableFlutes,
        priceYuanPerTon: paperMaterials.priceYuanPerTon,
        burstIndex: paperMaterials.burstIndex,
        ringCrushIndex: paperMaterials.ringCrushIndex,
        completenessStatus: paperMaterials.completenessStatus,
        missingFields: paperMaterials.missingFields,
        isActive: paperMaterials.isActive,
      })
      .from(paperMaterials)
      .innerJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(and(eq(paperMaterials.id, id), eq(paperMaterials.factoryId, paperFactories.id)))
      .limit(1);

    if (!materialWithFactory) {
      throw new Error("paper material not found");
    }

    return toPaperMaterialForUpdate(materialWithFactory);
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
}
