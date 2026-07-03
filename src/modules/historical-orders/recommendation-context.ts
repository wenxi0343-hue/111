import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  historicalOrderHabitSummaries,
  historicalOrderImportBatches,
  historicalOrders,
} from "@/db/schema";
import type * as schema from "@/db/schema";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import {
  getHistoricalOrderWeightBucket,
  type HistoricalOrderHabitDimensionType,
} from "@/modules/historical-orders/habit-summary";
import type { HistoricalOrderSizeBucketConfig } from "@/modules/historical-orders/import-preview";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";

const MIN_SIMILAR_ORDER_COUNT = 5;
const NO_HISTORICAL_HABIT_REFERENCE_MESSAGE = "暂无足够历史参考";

type AppDatabase = NodePgDatabase<typeof schema>;
type HistoricalOrderHabitSummaryRow = typeof historicalOrderHabitSummaries.$inferSelect;

export type HistoricalHabitRecommendationStatus =
  | "available"
  | "insufficient"
  | "unavailable";

export interface HistoricalHabitRecommendationBatch {
  id: string;
  confirmedAt?: Date | undefined;
  sizeBucketConfig: HistoricalOrderSizeBucketConfig;
}

export interface HistoricalHabitDimensionKey {
  dimensionType: HistoricalOrderHabitDimensionType;
  dimensionKey: string;
}

export interface HistoricalHabitMatchedDimensionKeys {
  productKey: string;
  sizeBucketKey?: string | undefined;
  weightBucketKey: string;
}

export interface HistoricalHabitRecommendationContext {
  status: HistoricalHabitRecommendationStatus;
  importBatchId?: string | undefined;
  sizeBucketConfig?: HistoricalOrderSizeBucketConfig | undefined;
  matchedDimensionKeys: HistoricalHabitMatchedDimensionKeys;
  similarOrderCount: number;
  summaries: HistoricalOrderHabitSummaryItem[];
  messages: string[];
}

export interface HistoricalHabitRecommendationRepository {
  findLatestConfirmedHabitBatch(): Promise<HistoricalHabitRecommendationBatch | undefined>;
  countSimilarStatisticalOrders(input: {
    importBatchId: string;
    boxSpec: NormalizedBoxSpec;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
  }): Promise<number>;
  listHabitSummariesForRecommendation(input: {
    importBatchId: string;
    dimensionKeys: HistoricalHabitDimensionKey[];
  }): Promise<HistoricalOrderHabitSummaryItem[]>;
}

export async function getHistoricalHabitRecommendationContext(input: {
  repository: HistoricalHabitRecommendationRepository;
  boxSpec: NormalizedBoxSpec;
}): Promise<HistoricalHabitRecommendationContext> {
  try {
    const batch = await input.repository.findLatestConfirmedHabitBatch();

    if (!batch) {
      return unavailableContext(input.boxSpec);
    }

    const matchedDimensionKeys = buildMatchedDimensionKeys(input.boxSpec, batch.sizeBucketConfig);
    const similarOrderCount = await input.repository.countSimilarStatisticalOrders({
      importBatchId: batch.id,
      boxSpec: input.boxSpec,
      sizeBucketConfig: batch.sizeBucketConfig,
    });

    if (similarOrderCount < MIN_SIMILAR_ORDER_COUNT) {
      return insufficientContext({
        batch,
        matchedDimensionKeys,
        similarOrderCount,
      });
    }

    const summaries = await input.repository.listHabitSummariesForRecommendation({
      importBatchId: batch.id,
      dimensionKeys: toDimensionKeys(matchedDimensionKeys),
    });

    if (summaries.length === 0) {
      return insufficientContext({
        batch,
        matchedDimensionKeys,
        similarOrderCount,
      });
    }

    return {
      status: "available",
      importBatchId: batch.id,
      sizeBucketConfig: batch.sizeBucketConfig,
      matchedDimensionKeys,
      similarOrderCount,
      summaries,
      messages: [],
    };
  } catch {
    return unavailableContext(input.boxSpec);
  }
}

export function getHistoricalOrderSizeBucket(
  input: Pick<NormalizedBoxSpec, "lengthMm" | "widthMm" | "heightMm">,
  sizeBucketConfig: HistoricalOrderSizeBucketConfig,
): string {
  const volume = input.lengthMm * input.widthMm * input.heightMm;

  if (volume <= sizeBucketConfig.smallMaxVolume) {
    return "小箱";
  }

  if (volume <= sizeBucketConfig.mediumMaxVolume) {
    return "中箱";
  }

  return "大箱";
}

export function createDrizzleHistoricalHabitRecommendationRepository(
  db: AppDatabase,
): HistoricalHabitRecommendationRepository {
  return new DrizzleHistoricalHabitRecommendationRepository(db);
}

class DrizzleHistoricalHabitRecommendationRepository
  implements HistoricalHabitRecommendationRepository
{
  constructor(private readonly db: AppDatabase) {}

  async findLatestConfirmedHabitBatch(): Promise<
    HistoricalHabitRecommendationBatch | undefined
  > {
    const [row] = await this.db
      .select({
        id: historicalOrderImportBatches.id,
        confirmedAt: historicalOrderImportBatches.confirmedAt,
        createdAt: historicalOrderImportBatches.createdAt,
        sizeBucketConfig: historicalOrderImportBatches.sizeBucketConfig,
      })
      .from(historicalOrderImportBatches)
      .where(eq(historicalOrderImportBatches.status, "confirmed"))
      .orderBy(
        desc(historicalOrderImportBatches.confirmedAt),
        desc(historicalOrderImportBatches.createdAt),
      )
      .limit(1);

    if (!row || !isHistoricalOrderSizeBucketConfig(row.sizeBucketConfig)) {
      return undefined;
    }

    return {
      id: row.id,
      confirmedAt: row.confirmedAt ?? row.createdAt,
      sizeBucketConfig: row.sizeBucketConfig,
    };
  }

  async countSimilarStatisticalOrders(input: {
    importBatchId: string;
    boxSpec: NormalizedBoxSpec;
    sizeBucketConfig: HistoricalOrderSizeBucketConfig;
  }): Promise<number> {
    const rows = await this.db
      .select({
        productName: historicalOrders.productName,
        productCategory: historicalOrders.productCategory,
        lengthMm: historicalOrders.lengthMm,
        widthMm: historicalOrders.widthMm,
        heightMm: historicalOrders.heightMm,
        weightKg: historicalOrders.weightKg,
      })
      .from(historicalOrders)
      .where(
        and(
          eq(historicalOrders.importBatchId, input.importBatchId),
          eq(historicalOrders.isStatistical, true),
        ),
      );

    const currentDimensionKeys = buildMatchedDimensionKeys(
      input.boxSpec,
      input.sizeBucketConfig,
    );

    return rows.filter((row) => {
      const weightKg = toNumberOrUndefined(row.weightKg);

      if (weightKg === undefined) {
        return false;
      }

      return (
        (row.productCategory ?? row.productName) === currentDimensionKeys.productKey &&
        getHistoricalOrderSizeBucket(row, input.sizeBucketConfig) ===
          currentDimensionKeys.sizeBucketKey &&
        getHistoricalOrderWeightBucket(weightKg) === currentDimensionKeys.weightBucketKey
      );
    }).length;
  }

  async listHabitSummariesForRecommendation(input: {
    importBatchId: string;
    dimensionKeys: HistoricalHabitDimensionKey[];
  }): Promise<HistoricalOrderHabitSummaryItem[]> {
    const rows = await this.db
      .select()
      .from(historicalOrderHabitSummaries)
      .where(eq(historicalOrderHabitSummaries.importBatchId, input.importBatchId))
      .orderBy(desc(historicalOrderHabitSummaries.orderCount));
    const acceptedKeys = new Set(
      input.dimensionKeys.map((key) => getDimensionLookupKey(key.dimensionType, key.dimensionKey)),
    );

    return rows
      .filter((row) =>
        acceptedKeys.has(getDimensionLookupKey(row.dimensionType, row.dimensionKey)),
      )
      .map(toHistoricalOrderHabitSummaryItem);
  }
}

function unavailableContext(boxSpec: NormalizedBoxSpec): HistoricalHabitRecommendationContext {
  return {
    status: "unavailable",
    matchedDimensionKeys: buildMatchedDimensionKeys(boxSpec),
    similarOrderCount: 0,
    summaries: [],
    messages: [NO_HISTORICAL_HABIT_REFERENCE_MESSAGE],
  };
}

function insufficientContext(input: {
  batch: HistoricalHabitRecommendationBatch;
  matchedDimensionKeys: HistoricalHabitMatchedDimensionKeys;
  similarOrderCount: number;
}): HistoricalHabitRecommendationContext {
  return {
    status: "insufficient",
    importBatchId: input.batch.id,
    sizeBucketConfig: input.batch.sizeBucketConfig,
    matchedDimensionKeys: input.matchedDimensionKeys,
    similarOrderCount: input.similarOrderCount,
    summaries: [],
    messages: [NO_HISTORICAL_HABIT_REFERENCE_MESSAGE],
  };
}

function buildMatchedDimensionKeys(
  boxSpec: NormalizedBoxSpec,
  sizeBucketConfig?: HistoricalOrderSizeBucketConfig | undefined,
): HistoricalHabitMatchedDimensionKeys {
  return {
    productKey: boxSpec.productType,
    sizeBucketKey:
      sizeBucketConfig === undefined
        ? undefined
        : getHistoricalOrderSizeBucket(boxSpec, sizeBucketConfig),
    weightBucketKey: getHistoricalOrderWeightBucket(boxSpec.productWeightKg),
  };
}

function toDimensionKeys(
  matchedDimensionKeys: HistoricalHabitMatchedDimensionKeys,
): HistoricalHabitDimensionKey[] {
  return [
    {
      dimensionType: "product",
      dimensionKey: matchedDimensionKeys.productKey,
    },
    ...(matchedDimensionKeys.sizeBucketKey === undefined
      ? []
      : [
          {
            dimensionType: "size_bucket" as const,
            dimensionKey: matchedDimensionKeys.sizeBucketKey,
          },
        ]),
    {
      dimensionType: "weight_bucket",
      dimensionKey: matchedDimensionKeys.weightBucketKey,
    },
  ];
}

function toHistoricalOrderHabitSummaryItem(
  row: HistoricalOrderHabitSummaryRow,
): HistoricalOrderHabitSummaryItem {
  return {
    id: row.id,
    importBatchId: row.importBatchId ?? "",
    dimensionType: row.dimensionType as HistoricalOrderHabitDimensionType,
    dimensionKey: row.dimensionKey,
    layerCount: row.layerCount ?? undefined,
    flute: row.flute ?? undefined,
    factoryNames: toStringArray(row.factoryNames),
    gramWeights: toNumberArray(row.gramWeights),
    orderCount: row.orderCount,
    frequency: Number(row.frequency),
    generatedAt: row.generatedAt,
  };
}

function isHistoricalOrderSizeBucketConfig(
  value: unknown,
): value is HistoricalOrderSizeBucketConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Partial<HistoricalOrderSizeBucketConfig>;

  return (
    typeof config.confirmed === "boolean" &&
    Number.isFinite(config.smallMaxVolume) &&
    Number.isFinite(config.mediumMaxVolume)
  );
}

function getDimensionLookupKey(
  dimensionType: HistoricalOrderHabitDimensionType | string,
  dimensionKey: string,
): string {
  return `${dimensionType}:${dimensionKey}`;
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

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
}
