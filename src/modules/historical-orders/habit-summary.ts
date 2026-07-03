import type { HistoricalOrderInsert } from "@/modules/historical-orders/import-commit";
import type {
  HistoricalOrderPaperMaterialCandidate,
  HistoricalOrderSizeBucketConfig,
} from "@/modules/historical-orders/import-preview";

export type HistoricalOrderHabitDimensionType = "product" | "size_bucket" | "weight_bucket";

export interface HistoricalOrderHabitSummaryInsert {
  importBatchId: string;
  dimensionType: HistoricalOrderHabitDimensionType;
  dimensionKey: string;
  layerCount?: number | undefined;
  flute?: string | undefined;
  factoryNames: string[];
  gramWeights: number[];
  orderCount: number;
  frequency: number;
}

interface SummaryGroup {
  summary: Omit<HistoricalOrderHabitSummaryInsert, "orderCount" | "frequency">;
  orderCount: number;
}

export function generateHistoricalOrderHabitSummaries(input: {
  importBatchId: string;
  orders: HistoricalOrderInsert[];
  materials: HistoricalOrderPaperMaterialCandidate[];
  sizeBucketConfig: HistoricalOrderSizeBucketConfig;
}): HistoricalOrderHabitSummaryInsert[] {
  const materialById = new Map(input.materials.map((material) => [material.id, material]));
  const groups = new Map<string, SummaryGroup>();
  const dimensionTotals = new Map<string, number>();

  for (const order of input.orders) {
    if (!order.isStatistical) {
      continue;
    }

    const combination = getOrderCombination(order, materialById);
    const dimensions = getOrderDimensions(order, input.sizeBucketConfig);

    for (const dimension of dimensions) {
      const totalKey = getDimensionTotalKey(dimension.dimensionType, dimension.dimensionKey);
      const groupKey = [
        totalKey,
        combination.layerCount ?? "",
        combination.flute ?? "",
        combination.factoryNames.join("|"),
        combination.gramWeights.join("|"),
      ].join("::");
      const currentGroup = groups.get(groupKey);

      dimensionTotals.set(totalKey, (dimensionTotals.get(totalKey) ?? 0) + 1);

      if (currentGroup) {
        currentGroup.orderCount += 1;
        continue;
      }

      groups.set(groupKey, {
        summary: {
          importBatchId: input.importBatchId,
          dimensionType: dimension.dimensionType,
          dimensionKey: dimension.dimensionKey,
          layerCount: combination.layerCount,
          flute: combination.flute,
          factoryNames: combination.factoryNames,
          gramWeights: combination.gramWeights,
        },
        orderCount: 1,
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const total =
        dimensionTotals.get(
          getDimensionTotalKey(group.summary.dimensionType, group.summary.dimensionKey),
        ) ?? group.orderCount;

      return {
        ...group.summary,
        orderCount: group.orderCount,
        frequency: roundFrequency(group.orderCount / total),
      };
    })
    .sort((left, right) => {
      if (left.dimensionType !== right.dimensionType) {
        return left.dimensionType.localeCompare(right.dimensionType);
      }

      if (left.dimensionKey !== right.dimensionKey) {
        return left.dimensionKey.localeCompare(right.dimensionKey);
      }

      return right.orderCount - left.orderCount;
    });
}

export function getHistoricalOrderWeightBucket(weightKg: number): string {
  if (weightKg <= 20) {
    return "≤20kg";
  }

  if (weightKg <= 30) {
    return "20-30kg";
  }

  return "≥30kg";
}

function getOrderDimensions(
  order: HistoricalOrderInsert,
  sizeBucketConfig: HistoricalOrderSizeBucketConfig,
): Array<{ dimensionType: HistoricalOrderHabitDimensionType; dimensionKey: string }> {
  const dimensions: Array<{ dimensionType: HistoricalOrderHabitDimensionType; dimensionKey: string }> =
    [
      {
        dimensionType: "product",
        dimensionKey: order.productCategory ?? order.productName,
      },
      {
        dimensionType: "size_bucket",
        dimensionKey: getSizeBucket(order, sizeBucketConfig),
      },
    ];

  if (order.weightKg !== undefined) {
    dimensions.push({
      dimensionType: "weight_bucket",
      dimensionKey: getHistoricalOrderWeightBucket(order.weightKg),
    });
  }

  return dimensions;
}

function getSizeBucket(
  order: HistoricalOrderInsert,
  sizeBucketConfig: HistoricalOrderSizeBucketConfig,
): string {
  const volume = order.lengthMm * order.widthMm * order.heightMm;

  if (volume <= sizeBucketConfig.smallMaxVolume) {
    return "小箱";
  }

  if (volume <= sizeBucketConfig.mediumMaxVolume) {
    return "中箱";
  }

  return "大箱";
}

function getOrderCombination(
  order: HistoricalOrderInsert,
  materialById: Map<string, HistoricalOrderPaperMaterialCandidate>,
) {
  const matchedMaterials = order.matchedMaterialIds
    .map((materialId) => materialById.get(materialId))
    .filter((material): material is HistoricalOrderPaperMaterialCandidate => material !== undefined);

  return {
    layerCount: order.parsedLayerCount,
    flute: order.parsedFlute,
    factoryNames: unique(
      matchedMaterials
        .map((material) => material.factoryName)
        .filter((factoryName): factoryName is string => factoryName !== undefined),
    ),
    gramWeights: unique(
      matchedMaterials
        .map((material) => material.gramWeightGsm)
        .filter((gramWeight): gramWeight is number => gramWeight !== undefined),
    ),
  };
}

function getDimensionTotalKey(
  dimensionType: HistoricalOrderHabitDimensionType,
  dimensionKey: string,
): string {
  return `${dimensionType}:${dimensionKey}`;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function roundFrequency(frequency: number): number {
  return Number(frequency.toFixed(4));
}
