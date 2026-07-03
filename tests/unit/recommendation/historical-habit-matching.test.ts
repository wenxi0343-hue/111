import { describe, expect, it } from "vitest";

import type { MatchingCandidate, RejectionReason } from "@/modules/calculations/types";
import type { HistoricalHabitRecommendationContext } from "@/modules/historical-orders/recommendation-context";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";
import {
  createHistoricalHabitConflictMessages,
  createRecommendationHistoricalHabitInfo,
} from "@/modules/recommendation/historical-habit-matching";
import type { RecommendationHistoricalHabitInfo } from "@/modules/recommendation/types";

describe("createRecommendationHistoricalHabitInfo", () => {
  it("候选同时匹配层数、瓦型和纸厂时返回高匹配", () => {
    const summary = createSummary({
      layerCount: 5,
      flute: "BC",
      factoryNames: ["脱敏纸厂A"],
      gramWeights: [200, 160],
      orderCount: 18,
      frequency: 0.62,
    });

    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate({
        layerCount: 5,
        fluteType: "BC",
        factoryName: "脱敏纸厂A",
        gramWeightGsm: 200,
      }),
      historicalHabitContext: createContext({ summaries: [summary] }),
      evidences: [{ summary, notices: [] }],
    });

    expect(info.label).toBe("高匹配");
    expect(info.level).toBe("high");
    expect(info.evidences[0]).toMatchObject({
      dimensionType: "product",
      dimensionKey: "电子产品",
      matchedFields: expect.arrayContaining(["layer_count", "flute", "factory"]),
      orderCount: 18,
      frequency: 0.62,
    });
  });

  it("候选匹配层数和瓦型但纸厂与克重不匹配时返回中匹配", () => {
    const summary = createSummary({
      layerCount: 5,
      flute: "BC",
      factoryNames: ["脱敏纸厂A"],
      gramWeights: [200],
    });

    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate({
        layerCount: 5,
        fluteType: "BC",
        factoryName: "脱敏纸厂B",
        gramWeightGsm: 120,
      }),
      historicalHabitContext: createContext({ summaries: [summary] }),
      evidences: [{ summary, notices: [] }],
    });

    expect(info.label).toBe("中匹配");
    expect(info.level).toBe("medium");
  });

  it("候选只匹配层数时返回低匹配", () => {
    const summary = createSummary({
      layerCount: 5,
      flute: "BC",
      factoryNames: ["脱敏纸厂A"],
      gramWeights: [200],
    });

    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate({
        layerCount: 5,
        fluteType: "B",
        factoryName: "脱敏纸厂B",
        gramWeightGsm: 120,
      }),
      historicalHabitContext: createContext({ summaries: [summary] }),
      evidences: [{ summary, notices: [] }],
    });

    expect(info.label).toBe("低匹配");
    expect(info.level).toBe("low");
  });

  it("历史上下文不足时返回暂无足够历史参考", () => {
    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate(),
      historicalHabitContext: createContext({
        status: "insufficient",
        similarOrderCount: 4,
        summaries: [],
        messages: ["暂无足够历史参考"],
      }),
      evidences: [],
    });

    expect(info.label).toBe("暂无足够历史参考");
    expect(info.level).toBe("insufficient");
    expect(info.reasons.join(" ")).toContain("相似历史订单少于 5 条");
  });

  it("高匹配理由来自摘要并包含维度、瓦型、次数和占比", () => {
    const summary = createSummary({
      dimensionKey: "电子产品",
      layerCount: 5,
      flute: "BC",
      orderCount: 18,
      frequency: 0.62,
    });

    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate({ layerCount: 5, fluteType: "BC" }),
      historicalHabitContext: createContext({ summaries: [summary] }),
      evidences: [{ summary, notices: [] }],
    });

    expect(info.reasons[0]).toContain("电子产品");
    expect(info.reasons[0]).toContain("BC 瓦");
    expect(info.reasons[0]).toContain("18 次");
    expect(info.reasons[0]).toContain("62%");
  });

  it("多个维度证据最多返回 3 条理由且每条都能追溯到 evidence", () => {
    const summaries = [
      createSummary({ dimensionType: "product", dimensionKey: "电子产品", orderCount: 18 }),
      createSummary({ dimensionType: "weight_bucket", dimensionKey: "20-30kg", orderCount: 12 }),
      createSummary({ dimensionType: "size_bucket", dimensionKey: "小箱", orderCount: 10 }),
      createSummary({ dimensionType: "product", dimensionKey: "备用产品", orderCount: 6 }),
    ];

    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate(),
      historicalHabitContext: createContext({ summaries }),
      evidences: summaries.map((summary) => ({ summary, notices: [] })),
    });

    expect(info.reasons).toHaveLength(3);
    expect(info.evidences).toHaveLength(3);
    for (const reason of info.reasons) {
      expect(
        info.evidences.some((evidence) => reason.includes(evidence.dimensionKey)),
      ).toBe(true);
    }
  });

  it("上下文可用但没有摘要证据时不抛异常并返回低匹配", () => {
    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate(),
      historicalHabitContext: createContext({ summaries: [] }),
      evidences: [],
    });

    expect(info.label).toBe("低匹配");
    expect(info.reasons).toEqual([]);
  });

  it("序列化结果不包含裸分字段", () => {
    const info: RecommendationHistoricalHabitInfo = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate(),
      historicalHabitContext: createContext(),
      evidences: [{ summary: createSummary(), notices: [] }],
    });

    expect(JSON.stringify(info)).not.toMatch(/score|rawScore|historicalHabitScore/i);
  });

  it("没有摘要 evidence 时不生成历史常用结论", () => {
    const info = createRecommendationHistoricalHabitInfo({
      candidate: createCandidate(),
      historicalHabitContext: createContext({ summaries: [] }),
      evidences: [],
    });

    expect(info.reasons.join(" ")).not.toContain("历史常用");
  });
});

describe("createHistoricalHabitConflictMessages", () => {
  it("历史常用组合强度不达标时生成未直接采用说明", () => {
    const messages = createHistoricalHabitConflictMessages({
      rejectedReasons: [
        {
          type: "STRENGTH_UNQUALIFIED",
          code: "ECT_TOO_LOW",
          message: "边压不足",
        },
      ],
    });

    expect(messages.join(" ")).toContain("历史常用组合未直接采用");
    expect(messages.join(" ")).toContain("边压不足");
  });

  it("历史常用组合设备不可生产时生成设备限制说明", () => {
    const messages = createHistoricalHabitConflictMessages({
      rejectedReasons: [
        {
          type: "NOT_MANUFACTURABLE",
          code: "BOARD_WIDTH_TOO_LARGE",
          message: "纸板宽超过设备限制",
        },
      ],
    });

    expect(messages.join(" ")).toContain("设备限制");
    expect(messages.join(" ")).toContain("纸板宽超过设备限制");
  });

  it("历史常用纸厂当前不可用时生成当前不可用说明", () => {
    const messages = createHistoricalHabitConflictMessages({
      unavailableRecords: [
        {
          summary: createSummary({ factoryNames: ["脱敏纸厂A"] }),
          reasonCode: "FACTORY_UNAVAILABLE",
          message: "历史常用组合当前不可用",
        },
      ],
    });

    expect(messages.join(" ")).toContain("历史常用组合当前不可用");
  });
});

function createContext(
  overrides: Partial<HistoricalHabitRecommendationContext> = {},
): HistoricalHabitRecommendationContext {
  return {
    status: "available",
    importBatchId: "batch-1",
    matchedDimensionKeys: {
      productKey: "电子产品",
      sizeBucketKey: "小箱",
      weightBucketKey: "20-30kg",
    },
    similarOrderCount: 8,
    summaries: [createSummary()],
    messages: [],
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
    layerCount: 5,
    flute: "BC",
    factoryNames: ["脱敏纸厂A"],
    gramWeights: [200, 160],
    orderCount: 18,
    frequency: 0.62,
    ...overrides,
  };
}

function createCandidate(
  overrides: {
    layerCount?: MatchingCandidate["layerCount"];
    fluteType?: MatchingCandidate["fluteType"];
    factoryName?: string;
    gramWeightGsm?: number;
  } = {},
): MatchingCandidate {
  const layerCount = overrides.layerCount ?? 5;
  const fluteType = overrides.fluteType ?? "BC";
  const factoryName = overrides.factoryName ?? "脱敏纸厂A";
  const gramWeightGsm = overrides.gramWeightGsm ?? 200;

  return {
    id: "candidate-1",
    layerCount,
    fluteType,
    layers: [
      createLayer("outer_liner", factoryName, gramWeightGsm),
      createLayer("corrugating", factoryName, 160, "B"),
      ...(layerCount === 3
        ? []
        : [
            createLayer("medium", factoryName, gramWeightGsm),
            createLayer("corrugating", factoryName, 160, fluteType === "BAC" ? "A" : "C"),
          ]),
      ...(layerCount === 7
        ? [
            createLayer("medium", factoryName, gramWeightGsm),
            createLayer("corrugating", factoryName, 160, "C"),
          ]
        : []),
      createLayer("inner_liner", factoryName, gramWeightGsm),
    ],
  };
}

function createLayer(
  role: MatchingCandidate["layers"][number]["role"],
  factoryName: string,
  gramWeightGsm: number,
  flute?: MatchingCandidate["layers"][number]["flute"],
): MatchingCandidate["layers"][number] {
  return {
    role,
    flute,
    paper: {
      id: `${role}-${flute ?? "liner"}`,
      paperCode: `${role}-${flute ?? "liner"}`,
      factoryName,
      gramWeightGsm,
      priceYuanPerTon: 3_000,
      burstIndex: 10,
      ringCrushIndex: 20,
    },
  };
}
