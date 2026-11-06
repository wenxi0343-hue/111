import type {
  MatchingSourceData,
  MatchingSourceDataRepository,
  MatchingSourcePaperMaterialRecord,
} from "@/modules/master-data/matching-source";
import type { ActionResult } from "@/shared/types/action-result";

const IN_STOCK_STATUS = "in_stock";
const READ_IN_STOCK_ROLLS_SQL = `
SELECT
  id,
  paper_code,
  material_code,
  specification,
  supplier_code,
  supplier,
  gram_weight,
  width_mm,
  weight_kg,
  unit_price_yuan_per_kg,
  material_category,
  status
FROM paper_paperroll
WHERE status = $1
ORDER BY material_code, paper_code
`;

export interface WarehousePaperRollRecord {
  id?: unknown;
  paper_code?: unknown;
  material_code?: unknown;
  specification?: unknown;
  supplier_code?: unknown;
  supplier?: unknown;
  gram_weight?: unknown;
  width_mm?: unknown;
  weight_kg?: unknown;
  unit_price_yuan_per_kg?: unknown;
  material_category?: unknown;
  status?: unknown;
}

export interface WarehouseDatabaseQueryClient {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: WarehousePaperRollRecord[] }>;
}

export class WarehouseDatabaseMatchingSourceDataRepository
  implements MatchingSourceDataRepository
{
  private readPromise: Promise<ActionResult<MatchingSourceData>> | undefined;

  constructor(private readonly client: WarehouseDatabaseQueryClient) {}

  readMatchingSourceData(): Promise<ActionResult<MatchingSourceData>> {
    this.readPromise ??= this.readFromDatabase();
    return this.readPromise;
  }

  private async readFromDatabase(): Promise<ActionResult<MatchingSourceData>> {
    try {
      const result = await this.client.query(READ_IN_STOCK_ROLLS_SQL, [IN_STOCK_STATUS]);

      return {
        ok: true,
        data: {
          paperMaterials: aggregateInStockRolls(result.rows),
          requireFormulaParameters: false,
          incompleteMaterialsBlockReadiness: false,
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "DATABASE_CONNECTION_FAILED",
          message: "数据库连接不可用，请检查地址、账号、密码或网络。",
        },
      };
    }
  }
}

export function aggregateInStockRolls(
  records: WarehousePaperRollRecord[],
): MatchingSourcePaperMaterialRecord[] {
  const groups = new Map<string, WarehousePaperRollRecord[]>();

  for (const record of records) {
    if (readText(record.status) !== IN_STOCK_STATUS) {
      continue;
    }

    const materialCode = readText(record.material_code);
    const rollCode = readText(record.paper_code);
    const groupKey = materialCode ?? `unlinked:${rollCode ?? groups.size + 1}`;
    const current = groups.get(groupKey) ?? [];

    current.push(record);
    groups.set(groupKey, current);
  }

  return Array.from(groups.entries()).map(([groupKey, rolls]) =>
    aggregateMaterialGroup(groupKey, rolls),
  );
}

export function inferWarehouseQualityGrade(text: string): "优等品" | "一等品" | "合格品" {
  if (text.includes("进口") || text.includes("金太阳")) {
    return "优等品";
  }

  const normalized = text.toUpperCase();

  if (normalized.includes("H级") || normalized.includes("AA级")) {
    return "一等品";
  }

  return "合格品";
}

function aggregateMaterialGroup(
  groupKey: string,
  rolls: WarehousePaperRollRecord[],
): MatchingSourcePaperMaterialRecord {
  const first = rolls[0] ?? {};
  const materialCode = readText(first.material_code);
  const paperCode = materialCode ?? readText(first.paper_code) ?? groupKey;
  const specification = firstNonEmptyText(rolls.map((roll) => roll.specification)) ?? paperCode;
  const materialCategory = firstNonEmptyText(rolls.map((roll) => roll.material_category));
  const classificationText = `${materialCategory ?? ""} ${specification}`;
  const supplier =
    firstNonEmptyText(rolls.map((roll) => roll.supplier)) ??
    firstNonEmptyText(rolls.map((roll) => roll.supplier_code)) ??
    "未命名供应商";
  const gramWeights = Array.from(
    new Set(
      rolls
        .map((roll) => readPositiveNumber(roll.gram_weight))
        .filter((value): value is number => value !== undefined),
    ),
  );

  return {
    id: materialCode ?? groupKey,
    code: paperCode,
    encoding: materialCode,
    name: specification,
    paper_type: materialCode ? inferPaperKind(classificationText) : undefined,
    grade: inferWarehouseQualityGrade(classificationText),
    grammage: gramWeights.length === 1 ? gramWeights[0] : undefined,
    price: calculateWeightedPriceYuanPerTon(rolls),
    supplier,
    stockWeightKg: sumPositiveWeights(rolls),
    isActive: true,
  };
}

function calculateWeightedPriceYuanPerTon(
  rolls: WarehousePaperRollRecord[],
): number | undefined {
  let pricedWeightKg = 0;
  let weightedPriceYuan = 0;

  for (const roll of rolls) {
    const weightKg = readPositiveNumber(roll.weight_kg);
    const priceYuanPerKg = readNonNegativeNumber(roll.unit_price_yuan_per_kg);

    if (weightKg === undefined || priceYuanPerKg === undefined) {
      return undefined;
    }

    pricedWeightKg += weightKg;
    weightedPriceYuan += weightKg * priceYuanPerKg;
  }

  return pricedWeightKg > 0 ? (weightedPriceYuan / pricedWeightKg) * 1000 : undefined;
}

function sumPositiveWeights(rolls: WarehousePaperRollRecord[]): number {
  return rolls.reduce((total, roll) => total + (readPositiveNumber(roll.weight_kg) ?? 0), 0);
}

function inferPaperKind(text: string): "linerboard" | "corrugating" | undefined {
  if (text.includes("瓦")) {
    return "corrugating";
  }

  if (text.includes("箱板") || text.includes("牛卡") || text.includes("卡纸")) {
    return "linerboard";
  }

  return undefined;
}

function firstNonEmptyText(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = readText(value);

    if (text) {
      return text;
    }
  }

  return undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  return text || undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  const numericValue = readNumber(value);
  return numericValue !== undefined && numericValue > 0 ? numericValue : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  const numericValue = readNumber(value);
  return numericValue !== undefined && numericValue >= 0 ? numericValue : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}
