import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { HistoricalOrderSizeBucketConfig } from "@/modules/historical-orders/import-preview";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";
import {
  getHistoricalHabitRecommendationContext,
  getHistoricalOrderSizeBucket,
  type HistoricalHabitRecommendationRepository,
} from "@/modules/historical-orders/recommendation-context";

const sizeBucketConfig: HistoricalOrderSizeBucketConfig = {
  confirmed: true,
  smallMaxVolume: 10_000_000,
  mediumMaxVolume: 30_000_000,
};

describe("getHistoricalOrderSizeBucket", () => {
  it("按当前批次尺寸配置把体积 8,000,000 归为小箱", () => {
    expect(
      getHistoricalOrderSizeBucket(
        {
          lengthMm: 200,
          widthMm: 200,
          heightMm: 200,
        },
        sizeBucketConfig,
      ),
    ).toBe("小箱");
  });
});

describe("getHistoricalHabitRecommendationContext", () => {
  it("没有已确认历史批次时返回 unavailable，且不携带敏感或偏好字段", async () => {
    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository(),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("unavailable");
    expect(context.importBatchId).toBeUndefined();
    expect(context.similarOrderCount).toBe(0);
    expect(context.summaries).toEqual([]);
    expect(context.matchedDimensionKeys).toMatchObject({
      productKey: "电子产品",
      weightBucketKey: "20-30kg",
    });
    expect(JSON.stringify(context)).not.toMatch(
      /historicalPrice|historicalCost|customer|preference/i,
    );
  });

  it("使用仓储返回的最新已确认习惯批次", async () => {
    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          return {
            id: "batch-20260703",
            confirmedAt: new Date("2026-07-03T08:00:00.000Z"),
            sizeBucketConfig,
          };
        },
        async countSimilarStatisticalOrders() {
          return 5;
        },
        async listHabitSummariesForRecommendation() {
          return [createSummary({ importBatchId: "batch-20260703" })];
        },
      }),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("available");
    expect(context.importBatchId).toBe("batch-20260703");
    expect(context.sizeBucketConfig).toEqual(sizeBucketConfig);
  });

  it.each([
    { weight: 20, expected: "≤20kg" },
    { weight: 25, expected: "20-30kg" },
    { weight: 31, expected: "≥30kg" },
  ])("按重量 $weight kg 生成 $expected 匹配键", async ({ weight, expected }) => {
    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          return {
            id: "batch-1",
            confirmedAt: new Date("2026-07-03T08:00:00.000Z"),
            sizeBucketConfig,
          };
        },
      }),
      boxSpec: createBoxSpec({ productWeightKg: weight }),
    });

    expect(context.matchedDimensionKeys.weightBucketKey).toBe(expected);
  });

  it("相似统计订单少于 5 条时返回 insufficient，并跳过摘要读取", async () => {
    let summaryReadCount = 0;

    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          return {
            id: "batch-1",
            confirmedAt: new Date("2026-07-03T08:00:00.000Z"),
            sizeBucketConfig,
          };
        },
        async countSimilarStatisticalOrders() {
          return 4;
        },
        async listHabitSummariesForRecommendation() {
          summaryReadCount += 1;
          return [createSummary()];
        },
      }),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("insufficient");
    expect(context.similarOrderCount).toBe(4);
    expect(context.summaries).toEqual([]);
    expect(summaryReadCount).toBe(0);
  });

  it("相似统计订单达到 5 条且有摘要时返回 available", async () => {
    const receivedDimensionKeys: string[] = [];

    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          return {
            id: "batch-1",
            confirmedAt: new Date("2026-07-03T08:00:00.000Z"),
            sizeBucketConfig,
          };
        },
        async countSimilarStatisticalOrders() {
          return 5;
        },
        async listHabitSummariesForRecommendation(input) {
          receivedDimensionKeys.push(...input.dimensionKeys.map((key) => key.dimensionKey));
          return [createSummary()];
        },
      }),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("available");
    expect(context.similarOrderCount).toBe(5);
    expect(context.summaries).toHaveLength(1);
    expect(receivedDimensionKeys).toEqual(["电子产品", "小箱", "20-30kg"]);
  });

  it("相似统计订单达到 8 条但摘要为空时返回 insufficient", async () => {
    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          return {
            id: "batch-1",
            confirmedAt: new Date("2026-07-03T08:00:00.000Z"),
            sizeBucketConfig,
          };
        },
        async countSimilarStatisticalOrders() {
          return 8;
        },
        async listHabitSummariesForRecommendation() {
          return [];
        },
      }),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("insufficient");
    expect(context.similarOrderCount).toBe(8);
    expect(context.summaries).toEqual([]);
  });

  it("仓储读取异常时返回 unavailable，且不泄露数据库错误", async () => {
    const context = await getHistoricalHabitRecommendationContext({
      repository: createRepository({
        async findLatestConfirmedHabitBatch() {
          throw new Error("database password leaked");
        },
      }),
      boxSpec: createBoxSpec(),
    });

    expect(context.status).toBe("unavailable");
    expect(context.messages.join(" ")).not.toContain("database password leaked");
  });
});

function createRepository(
  overrides: Partial<HistoricalHabitRecommendationRepository> = {},
): HistoricalHabitRecommendationRepository {
  return {
    async findLatestConfirmedHabitBatch() {
      return undefined;
    },
    async countSimilarStatisticalOrders() {
      return 0;
    },
    async listHabitSummariesForRecommendation() {
      return [];
    },
    ...overrides,
  };
}

function createBoxSpec(overrides: Partial<NormalizedBoxSpec> = {}): NormalizedBoxSpec {
  return {
    lengthMm: 200,
    widthMm: 200,
    heightMm: 200,
    structureType: "0201",
    formingMethod: "glue",
    productType: "电子产品",
    productWeightKg: 25,
    arrangement: "single_row",
    productionQuantity: 1_000,
    stackingRequirement: {
      status: "not_required",
      displayText: "未填写堆码层数，承重未校核",
    },
    ...overrides,
  };
}

function createSummary(
  overrides: Partial<HistoricalOrderHabitSummaryItem> = {},
): HistoricalOrderHabitSummaryItem {
  return {
    importBatchId: "batch-1",
    dimensionType: "product",
    dimensionKey: "电子产品",
    layerCount: 3,
    flute: "B",
    factoryNames: ["玖龙"],
    gramWeights: [120, 110, 120],
    orderCount: 5,
    frequency: 1,
    ...overrides,
  };
}
