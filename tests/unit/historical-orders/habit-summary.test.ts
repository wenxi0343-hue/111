import { describe, expect, it } from "vitest";

import type { HistoricalOrderInsert } from "@/modules/historical-orders/import-commit";
import {
  generateHistoricalOrderHabitSummaries,
  getHistoricalOrderWeightBucket,
} from "@/modules/historical-orders/habit-summary";
import type {
  HistoricalOrderPaperMaterialCandidate,
  HistoricalOrderSizeBucketConfig,
} from "@/modules/historical-orders/import-preview";

const sizeBucketConfig: HistoricalOrderSizeBucketConfig = {
  confirmed: true,
  smallMaxVolume: 10_000_000,
  mediumMaxVolume: 30_000_000,
};
const materials: HistoricalOrderPaperMaterialCandidate[] = [
  {
    id: "material-r2",
    paperCode: "r2",
    factoryName: "脱敏纸厂A",
    gramWeightGsm: 140,
  },
  {
    id: "material-k3",
    paperCode: "k3",
    factoryName: "脱敏纸厂B",
    gramWeightGsm: 170,
  },
];

describe("historical order habit summary", () => {
  it("only summarizes statistical orders", () => {
    const summaries = generateHistoricalOrderHabitSummaries({
      importBatchId: "batch-1",
      orders: [
        createOrder("order-1", { productName: "脱敏电子产品", isStatistical: true }),
        createOrder("order-2", { productName: "脱敏电子产品", isStatistical: true }),
        createOrder("order-3", { productName: "脱敏电子产品", isStatistical: true }),
        createOrder("order-4", { productName: "脱敏电子产品", isStatistical: false }),
        createOrder("order-5", { productName: "脱敏电子产品", isStatistical: false }),
      ],
      materials,
      sizeBucketConfig,
    });

    const productSummaries = summaries.filter(
      (summary) =>
        summary.dimensionType === "product" && summary.dimensionKey === "脱敏电子产品",
    );

    expect(productSummaries).toHaveLength(1);
    expect(productSummaries[0]).toMatchObject({
      orderCount: 3,
      frequency: 1,
    });
  });

  it("sorts product combinations by count and calculates frequency within the dimension key", () => {
    const summaries = generateHistoricalOrderHabitSummaries({
      importBatchId: "batch-1",
      orders: [
        createOrder("order-1", { productName: "脱敏电子产品", matchedMaterialIds: ["material-r2"] }),
        createOrder("order-2", { productName: "脱敏电子产品", matchedMaterialIds: ["material-r2"] }),
        createOrder("order-3", { productName: "脱敏电子产品", matchedMaterialIds: ["material-r2"] }),
        createOrder("order-4", {
          productName: "脱敏电子产品",
          matchedMaterialIds: ["material-k3"],
          parsedLayerCount: 5,
          parsedFlute: "BC",
        }),
      ],
      materials,
      sizeBucketConfig,
    });

    const productSummaries = summaries.filter(
      (summary) =>
        summary.dimensionType === "product" && summary.dimensionKey === "脱敏电子产品",
    );

    expect(productSummaries.map((summary) => summary.orderCount)).toEqual([3, 1]);
    expect(productSummaries.map((summary) => summary.frequency)).toEqual([0.75, 0.25]);
  });

  it("uses fixed weight buckets at the documented boundaries", () => {
    expect(getHistoricalOrderWeightBucket(20)).toBe("≤20kg");
    expect(getHistoricalOrderWeightBucket(25)).toBe("20-30kg");
    expect(getHistoricalOrderWeightBucket(30)).toBe("20-30kg");
    expect(getHistoricalOrderWeightBucket(31)).toBe("≥30kg");
  });

  it("skips the weight dimension for missing weights but keeps product and size summaries", () => {
    const summaries = generateHistoricalOrderHabitSummaries({
      importBatchId: "batch-1",
      orders: [createOrder("order-1", { weightKg: undefined })],
      materials,
      sizeBucketConfig,
    });

    expect(summaries.some((summary) => summary.dimensionType === "weight_bucket")).toBe(false);
    expect(summaries.some((summary) => summary.dimensionType === "product")).toBe(true);
    expect(summaries.some((summary) => summary.dimensionType === "size_bucket")).toBe(true);
  });

  it("classifies sizes using the confirmed size bucket configuration", () => {
    const summaries = generateHistoricalOrderHabitSummaries({
      importBatchId: "batch-1",
      orders: [
        createOrder("order-1", {
          lengthMm: 200,
          widthMm: 200,
          heightMm: 200,
        }),
      ],
      materials,
      sizeBucketConfig,
    });

    expect(summaries).toContainEqual(
      expect.objectContaining({
        dimensionType: "size_bucket",
        dimensionKey: "小箱",
        orderCount: 1,
      }),
    );
  });

  it("returns combination details without cost or price conclusions", () => {
    const summaries = generateHistoricalOrderHabitSummaries({
      importBatchId: "batch-1",
      orders: [
        {
          ...createOrder("order-1"),
          historicalCostYuan: 123,
          historicalPriceYuan: 456,
        } as HistoricalOrderInsert & Record<string, unknown>,
      ],
      materials,
      sizeBucketConfig,
    });

    expect(summaries[0]).toMatchObject({
      layerCount: 3,
      flute: "B",
      factoryNames: ["脱敏纸厂A"],
      gramWeights: [140],
      orderCount: 1,
      frequency: 1,
    });
    expect(Object.keys(summaries[0] ?? {})).not.toContain("currentCostConclusion");
    expect(Object.keys(summaries[0] ?? {})).not.toContain("historicalCostConclusion");
    expect(Object.keys(summaries[0] ?? {})).not.toContain("priceTrendConclusion");
  });
});

function createOrder(
  importRowId: string,
  overrides: Partial<HistoricalOrderInsert> = {},
): HistoricalOrderInsert {
  return {
    importBatchId: "batch-1",
    importRowId,
    orderDate: "2026-07-01",
    productName: "脱敏产品A",
    lengthMm: 300,
    widthMm: 200,
    heightMm: 150,
    quantity: 1000,
    weightKg: 25,
    rawPaperCode: "r2",
    parsedLayerCount: 3,
    parsedFlute: "B",
    matchedMaterialIds: ["material-r2"],
    paperCodeStatus: "matched",
    exceptionReasons: [],
    isStatistical: true,
    ...overrides,
  };
}
