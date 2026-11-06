import type {
  ListRecommendablePaperMaterialsRepository,
  RecommendablePaperMaterial,
} from "@/modules/master-data/list-recommendable-paper-materials";
import type {
  MatchingDataMissingItem,
  MatchingReadiness,
  MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import type { ActionResult } from "@/shared/types/action-result";

import { resolvePaperStrengthStandard } from "./paper-strength-standards";

export interface MatchingSourcePaperMaterialRecord {
  id?: unknown;
  code?: unknown;
  encoding?: unknown;
  name?: unknown;
  paper_type?: unknown;
  grade?: unknown;
  grammage?: unknown;
  price?: unknown;
  supplier?: unknown;
  burstIndex?: unknown;
  ringCrushIndex?: unknown;
  applicableFlutes?: unknown;
  stockWeightKg?: unknown;
  isActive?: unknown;
}

export interface MatchingSourceData {
  paperMaterials: MatchingSourcePaperMaterialRecord[];
  requireFormulaParameters?: boolean | undefined;
  incompleteMaterialsBlockReadiness?: boolean | undefined;
}

export interface MatchingSourceDataRepository {
  readMatchingSourceData(): Promise<ActionResult<MatchingSourceData>>;
}

export class MatchingSourceReadinessRepository implements MatchingReadinessRepository {
  constructor(private readonly sourceRepository: MatchingSourceDataRepository) {}

  async getMatchingReadiness(): Promise<MatchingReadiness> {
    const sourceData = await readSuccessfulSourceData(this.sourceRepository);
    const materials = mapSourcePaperMaterials(sourceData.paperMaterials);
    const activeMaterials = materials.filter((material) => material.isActive);
    const completeMaterials = activeMaterials.filter(
      (material) => material.completenessStatus === "complete",
    );

    return {
      hasPaperFactories: activeMaterials.some((material) => material.factoryName.trim().length > 0),
      hasLinerPaper: completeMaterials.some((material) => material.paperKind === "linerboard"),
      hasCorrugatingPaper: completeMaterials.some(
        (material) => material.paperKind === "corrugating",
      ),
      hasFormulaParameters: sourceData.requireFormulaParameters === false,
      missingItems:
        sourceData.incompleteMaterialsBlockReadiness === false
          ? []
          : collectMatchingDataMissingItems(sourceData),
    };
  }
}

export class MatchingSourcePaperMaterialRepository
  implements ListRecommendablePaperMaterialsRepository
{
  constructor(private readonly sourceRepository: MatchingSourceDataRepository) {}

  async listRecommendablePaperMaterials(): Promise<RecommendablePaperMaterial[]> {
    const sourceData = await readSuccessfulSourceData(this.sourceRepository);

    return mapSourcePaperMaterials(sourceData.paperMaterials).filter(
      (material) => material.isActive && material.completenessStatus === "complete",
    );
  }
}

export function mapSourcePaperMaterials(
  records: MatchingSourcePaperMaterialRecord[],
): RecommendablePaperMaterial[] {
  return records.map((record, index) => {
    const paperCode = readText(record.code) ?? `paper-${index + 1}`;
    const paperKind = normalizePaperKind(readText(record.paper_type));
    const name = readText(record.name) ?? paperCode;
    const factoryName = readText(record.supplier) ?? "未命名供应商";
    const gramWeightGsm = readNumber(record.grammage) ?? 0;
    const priceYuanPerTon = readPositiveNumber(record.price);
    const grade = readText(record.grade);
    const strengthStandard = resolvePaperStrengthStandard({
      paperKind,
      grade,
      gramWeightGsm,
    });
    const burstIndex =
      readPositiveNumber(record.burstIndex) ?? strengthStandard.standard?.burstIndex;
    const ringCrushIndex =
      readPositiveNumber(record.ringCrushIndex) ?? strengthStandard.standard?.ringCrushIndex;
    const applicableFlutes =
      readStringArray(record.applicableFlutes) ??
      (paperKind === "corrugating" ? ["A", "B", "C", "E"] : []);
    const missingFields = collectMappedMissingFields({
      paperKind,
      gramWeightGsm,
      priceYuanPerTon,
      burstIndex,
      ringCrushIndex,
      strengthStandardMissingField: strengthStandard.missingReason?.field,
    });

    return {
      id: readText(record.id) ?? paperCode,
      paperCode,
      paperEncoding: readText(record.encoding),
      factoryId: factoryName,
      factoryName,
      name,
      paperKind,
      grade: grade ?? "",
      gramWeightGsm,
      applicableFlutes,
      priceYuanPerTon,
      burstIndex,
      ringCrushIndex,
      completenessStatus: missingFields.length === 0 ? "complete" : "incomplete",
      missingFields,
      isActive: readBoolean(record.isActive) ?? true,
    };
  });
}

export function collectMatchingDataMissingItems(
  sourceData: MatchingSourceData,
): MatchingDataMissingItem[] {
  return sourceData.paperMaterials.flatMap((record) => {
    const [material] = mapSourcePaperMaterials([record]);

    if (!material?.isActive) {
      return [];
    }

    return material.missingFields
      .filter((field) => field !== "priceYuanPerTon" && field !== "strengthStandard")
      .map((field) => ({
        scope: "paper_material" as const,
        code: material.paperCode,
        name: material.name,
        field,
        message: `${material.paperCode} ${material.name} 缺少${getMissingFieldLabel(field)}`,
      }));
  });
}

async function readSuccessfulSourceData(
  repository: MatchingSourceDataRepository,
): Promise<MatchingSourceData> {
  const result = await repository.readMatchingSourceData();

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result.data;
}

function collectMappedMissingFields(input: {
  paperKind: string;
  gramWeightGsm: number;
  priceYuanPerTon: number | undefined;
  burstIndex: number | undefined;
  ringCrushIndex: number | undefined;
  strengthStandardMissingField?: string | undefined;
}): string[] {
  const fields: string[] = [];

  if (input.paperKind !== "linerboard" && input.paperKind !== "corrugating") {
    fields.push("paperKind");
  }

  if (!Number.isFinite(input.gramWeightGsm) || input.gramWeightGsm <= 0) {
    fields.push("gramWeightGsm");
  }

  if (input.priceYuanPerTon === undefined) {
    fields.push("priceYuanPerTon");
  }

  if (input.paperKind === "linerboard" && input.burstIndex === undefined) {
    fields.push(input.strengthStandardMissingField ?? "burstIndex");
  }

  if (input.ringCrushIndex === undefined) {
    fields.push(input.strengthStandardMissingField ?? "ringCrushIndex");
  }

  return Array.from(new Set(fields));
}

function normalizePaperKind(value: string | undefined): string {
  const text = value ?? "";

  if (text.includes("瓦")) {
    return "corrugating";
  }

  if (text.includes("箱板") || text.includes("牛卡") || text.includes("卡纸")) {
    return "linerboard";
  }

  return text;
}

function getMissingFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    paperKind: "纸种",
    grade: "等级（优等品、一等品或合格品）",
    gramWeightGsm: "克重",
    priceYuanPerTon: "纸价",
    burstIndex: "耐破指数",
    ringCrushIndex: "横向环压指数",
    strengthStandard: "该克重对应的强度标准",
  };

  return labels[field] ?? field;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text || undefined;
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  const numericValue = readNumber(value);
  return numericValue !== undefined && numericValue > 0 ? numericValue : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return undefined;
}
