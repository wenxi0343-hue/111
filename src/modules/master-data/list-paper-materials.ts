import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { paperFactories, paperMaterials } from "@/db/schema";
import type * as schema from "@/db/schema";

export type PaperMaterialCompletenessStatus = "complete" | "incomplete";

export interface PaperMaterialListItem {
  id: string;
  paperCode: string;
  paperEncoding?: string | undefined;
  factoryId: string;
  factoryName: string;
  name: string;
  paperKind: string;
  grade?: string | undefined;
  gramWeightGsm: number;
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  completenessStatus: PaperMaterialCompletenessStatus;
  missingFields: string[];
  isActive: boolean;
}

export interface ListPaperMaterialsQuery {
  completenessStatus?: PaperMaterialCompletenessStatus | undefined;
  isActive?: boolean | undefined;
  paperKind?: "linerboard" | "corrugating" | "unknown" | undefined;
  factoryId?: string | undefined;
  keyword?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface NormalizedListPaperMaterialsQuery
  extends Omit<ListPaperMaterialsQuery, "page" | "pageSize"> {
  page: number;
  pageSize: number;
}

export interface ListPaperMaterialsResult {
  items: PaperMaterialListItem[];
  total: number;
}

export interface ListPaperMaterialsRepository {
  listPaperMaterials(query: NormalizedListPaperMaterialsQuery): Promise<ListPaperMaterialsResult>;
}

type AppDatabase = NodePgDatabase<typeof schema>;

interface DrizzlePaperMaterialListRow {
  id: string;
  paperCode: string;
  paperEncoding: string | null;
  factoryId: string;
  factoryName: string;
  name: string;
  paperKind: string;
  grade: string | null;
  gramWeightGsm: number;
  priceYuanPerTon: string | null;
  burstIndex: string | null;
  ringCrushIndex: string | null;
  completenessStatus: string;
  missingFields: unknown;
  isActive: boolean;
}

export async function listPaperMaterialsFromRepository(input: {
  repository: ListPaperMaterialsRepository;
  query: ListPaperMaterialsQuery;
}): Promise<ListPaperMaterialsResult> {
  return input.repository.listPaperMaterials(normalizeListPaperMaterialsQuery(input.query));
}

export function normalizeListPaperMaterialsQuery(
  query: ListPaperMaterialsQuery,
): NormalizedListPaperMaterialsQuery {
  return {
    completenessStatus: query.completenessStatus,
    isActive: query.isActive,
    paperKind: query.paperKind,
    factoryId: query.factoryId,
    keyword: query.keyword?.trim() || undefined,
    page: query.page && query.page > 0 ? query.page : 1,
    pageSize: query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 20,
  };
}

export function createDrizzleListPaperMaterialsRepository(
  db: AppDatabase,
): ListPaperMaterialsRepository {
  return new DrizzleListPaperMaterialsRepository(db);
}

class DrizzleListPaperMaterialsRepository implements ListPaperMaterialsRepository {
  constructor(private readonly db: AppDatabase) {}

  async listPaperMaterials(
    query: NormalizedListPaperMaterialsQuery,
  ): Promise<ListPaperMaterialsResult> {
    const conditions = buildListPaperMaterialsConditions(query);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const items = await this.db
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
        priceYuanPerTon: paperMaterials.priceYuanPerTon,
        burstIndex: paperMaterials.burstIndex,
        ringCrushIndex: paperMaterials.ringCrushIndex,
        completenessStatus: paperMaterials.completenessStatus,
        missingFields: paperMaterials.missingFields,
        isActive: paperMaterials.isActive,
      })
      .from(paperMaterials)
      .innerJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(whereClause)
      .orderBy(asc(paperMaterials.paperCode))
      .limit(query.pageSize)
      .offset(offset);

    const [totalRow] = await this.db
      .select({ value: count() })
      .from(paperMaterials)
      .innerJoin(paperFactories, eq(paperMaterials.factoryId, paperFactories.id))
      .where(whereClause);

    return {
      items: items.map(toPaperMaterialListItem),
      total: totalRow?.value ?? 0,
    };
  }
}

function buildListPaperMaterialsConditions(
  query: NormalizedListPaperMaterialsQuery,
): SQL[] {
  const conditions: SQL[] = [];

  if (query.completenessStatus) {
    conditions.push(eq(paperMaterials.completenessStatus, query.completenessStatus));
  }

  if (query.isActive !== undefined) {
    conditions.push(eq(paperMaterials.isActive, query.isActive));
  }

  if (query.paperKind) {
    conditions.push(eq(paperMaterials.paperKind, query.paperKind));
  }

  if (query.factoryId) {
    conditions.push(eq(paperMaterials.factoryId, query.factoryId));
  }

  if (query.keyword) {
    const pattern = `%${query.keyword}%`;
    const keywordCondition = or(
      ilike(paperMaterials.paperCode, pattern),
      ilike(paperMaterials.name, pattern),
      ilike(paperFactories.name, pattern),
    );

    if (keywordCondition) {
      conditions.push(keywordCondition);
    }
  }

  return conditions;
}

function toPaperMaterialListItem(row: DrizzlePaperMaterialListRow): PaperMaterialListItem {
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
    priceYuanPerTon: toNumberOrUndefined(row.priceYuanPerTon),
    burstIndex: toNumberOrUndefined(row.burstIndex),
    ringCrushIndex: toNumberOrUndefined(row.ringCrushIndex),
    completenessStatus: row.completenessStatus === "complete" ? "complete" : "incomplete",
    missingFields: toStringArray(row.missingFields),
    isActive: row.isActive,
  };
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
