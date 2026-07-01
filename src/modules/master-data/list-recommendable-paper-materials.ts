import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { paperFactories, paperMaterials } from "@/db/schema";
import type * as schema from "@/db/schema";

type AppDatabase = NodePgDatabase<typeof schema>;

export type RecommendablePaperMaterialCompletenessStatus = "complete" | "incomplete";

export interface RecommendablePaperMaterial {
  id: string;
  paperCode: string;
  paperEncoding?: string | undefined;
  factoryId: string;
  factoryName: string;
  name: string;
  paperKind: string;
  grade?: string | undefined;
  gramWeightGsm: number;
  usage?: string | undefined;
  applicableFlutes: string[];
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  completenessStatus: RecommendablePaperMaterialCompletenessStatus;
  missingFields: string[];
  isActive: boolean;
}

export interface ListRecommendablePaperMaterialsResult {
  items: RecommendablePaperMaterial[];
}

export interface ListRecommendablePaperMaterialsRepository {
  listRecommendablePaperMaterials(): Promise<RecommendablePaperMaterial[]>;
}

interface DrizzleRecommendablePaperMaterialRow {
  id: string;
  paperCode: string;
  paperEncoding: string | null;
  factoryId: string;
  factoryName: string;
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

export async function listRecommendablePaperMaterialsFromRepository({
  repository,
}: {
  repository: ListRecommendablePaperMaterialsRepository;
}): Promise<ListRecommendablePaperMaterialsResult> {
  return {
    items: await repository.listRecommendablePaperMaterials(),
  };
}

export function createDrizzleListRecommendablePaperMaterialsRepository(
  db: AppDatabase,
): ListRecommendablePaperMaterialsRepository {
  return new DrizzleListRecommendablePaperMaterialsRepository(db);
}

class DrizzleListRecommendablePaperMaterialsRepository
  implements ListRecommendablePaperMaterialsRepository
{
  constructor(private readonly db: AppDatabase) {}

  async listRecommendablePaperMaterials(): Promise<RecommendablePaperMaterial[]> {
    const rows = await this.db
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
      .where(
        and(
          eq(paperMaterials.isActive, true),
          eq(paperMaterials.completenessStatus, "complete"),
        ),
      )
      .orderBy(asc(paperMaterials.paperCode));

    return rows.map(toRecommendablePaperMaterial);
  }
}

function toRecommendablePaperMaterial(
  row: DrizzleRecommendablePaperMaterialRow,
): RecommendablePaperMaterial {
  return {
    id: row.id,
    paperCode: row.paperCode,
    paperEncoding: row.paperEncoding ?? undefined,
    factoryId: row.factoryId,
    factoryName: row.factoryName,
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
