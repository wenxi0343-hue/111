import { describe, expect, it } from "vitest";

import { evaluateMatchingCandidates } from "@/modules/calculations/evaluate-matching-candidates";
import type {
  CandidateEvaluation,
  MatchingCandidate,
  RejectionReason,
  SingleFluteType,
} from "@/modules/calculations/types";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { HistoricalHabitRecommendationContext } from "@/modules/historical-orders/recommendation-context";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";
import type { RecommendablePaperMaterial } from "@/modules/master-data/list-recommendable-paper-materials";
import {
  createHistoricalHabitMatchingCandidates,
  splitHistoricalFluteType,
} from "@/modules/recommendation/historical-habit-candidates";
import { createMatchingCandidateFingerprint } from "@/modules/recommendation/scoring";

describe("splitHistoricalFluteType", () => {
  it.each([
    { flute: "B", expected: ["B"] },
    { flute: "BC", expected: ["B", "C"] },
    { flute: "BAC", expected: ["B", "A", "C"] },
  ])("把历史瓦型 $flute 拆成瓦纸层 $expected", ({ flute, expected }) => {
    expect(splitHistoricalFluteType(flute)).toEqual(expected);
  });
});

describe("createHistoricalHabitMatchingCandidates", () => {
  it("按三层 B 瓦历史摘要生成历史优先候选", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 3, flute: "B", gramWeights: [200, 160] })],
      }),
      materials: [
        createMaterial({ id: "outer-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({ id: "inner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      layerCount: 3,
      fluteType: "B",
      layers: [
        { role: "outer_liner", paper: { id: "outer-200" } },
        { role: "corrugating", flute: "B", paper: { id: "corr-b-160" } },
        { role: "inner_liner", paper: { id: "outer-200" } },
      ],
    });
    expect(result.evidenceByCandidateFingerprint).toEqual({
      [createMatchingCandidateFingerprint(result.candidates[0]!)]: [
        expect.objectContaining({
          summary: expect.objectContaining({ layerCount: 3, flute: "B" }),
          notices: [],
        }),
      ],
    });
  });

  it("按五层 BC 历史摘要生成包含两层瓦纸的候选", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 5, flute: "BC", gramWeights: [200, 160] })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
        createMaterial({
          id: "corr-c-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["C"],
        }),
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.layerCount).toBe(5);
    expect(result.candidates[0]?.fluteType).toBe("BC");
    expect(
      result.candidates[0]?.layers.filter((layer) => layer.role === "corrugating"),
    ).toEqual([
      expect.objectContaining({ flute: "B", paper: expect.objectContaining({ id: "corr-b-160" }) }),
      expect.objectContaining({ flute: "C", paper: expect.objectContaining({ id: "corr-c-160" }) }),
    ]);
  });

  it("按七层 BAC 历史摘要生成包含三层瓦纸的候选", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 7, flute: "BAC", gramWeights: [200, 160] })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
        createMaterial({
          id: "corr-a-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["A"],
        }),
        createMaterial({
          id: "corr-c-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["C"],
        }),
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.layerCount).toBe(7);
    expect(
      result.candidates[0]?.layers
        .filter((layer) => layer.role === "corrugating")
        .map((layer) => layer.flute),
    ).toEqual(["B", "A", "C"]);
  });

  it("历史常用纸厂当前没有可用原纸时不生成候选并记录不可用原因", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ factoryNames: ["脱敏纸厂A"] })],
      }),
      materials: [
        createMaterial({
          id: "other-liner",
          factoryName: "脱敏纸厂B",
          paperKind: "linerboard",
        }),
        createMaterial({
          id: "other-corrugating",
          factoryName: "脱敏纸厂B",
          paperKind: "corrugating",
          applicableFlutes: ["B"],
        }),
      ],
    });

    expect(result.candidates).toEqual([]);
    expect(result.unavailableRecords).toEqual([
      expect.objectContaining({
        reasonCode: "FACTORY_UNAVAILABLE",
        message: "历史常用组合当前不可用",
      }),
    ]);
  });

  it("历史克重当前没有完全匹配时生成相近候选并记录说明", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ gramWeights: [200, 180] })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
      ],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.notices).toEqual(["历史常用克重当前不完全一致，已使用当前可用相近原纸"]);
    expect(
      result.evidenceByCandidateFingerprint[
        createMatchingCandidateFingerprint(result.candidates[0]!)
      ]?.[0]?.notices,
    ).toEqual(["历史常用克重当前不完全一致，已使用当前可用相近原纸"]);
  });

  it("历史瓦型当前没有适用瓦纸时不生成候选并记录瓦纸不可用原因", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 5, flute: "BC" })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
      ],
    });

    expect(result.candidates).toEqual([]);
    expect(result.unavailableRecords).toEqual([
      expect.objectContaining({
        reasonCode: "CORRUGATING_UNAVAILABLE",
        message: "当前瓦纸不可用",
      }),
    ]);
  });

  it("历史候选和默认候选业务组合相同时只保留历史候选和历史证据", () => {
    const defaultCandidate = createDefaultCandidate();

    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 3, flute: "B", gramWeights: [200, 160] })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
      ],
      defaultCandidates: [defaultCandidate],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.id).toContain("historical");
    expect(result.evidenceByCandidateFingerprint).toHaveProperty(
      createMatchingCandidateFingerprint(result.candidates[0]!),
    );
  });

  it("历史习惯上下文不足时只返回默认候选和暂无参考说明", () => {
    const defaultCandidate = createDefaultCandidate();

    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        status: "insufficient",
        summaries: [],
        messages: ["暂无足够历史参考"],
      }),
      materials: [],
      defaultCandidates: [defaultCandidate],
    });

    expect(result.candidates).toEqual([defaultCandidate]);
    expect(result.messages).toEqual(["暂无足够历史参考"]);
    expect(result.evidenceByCandidateFingerprint).toEqual({});
  });

  it("历史候选生成结果不包含成本、强度或达标结论", () => {
    const result = createHistoricalHabitMatchingCandidates({
      historicalHabitContext: createContext({
        summaries: [createSummary({ layerCount: 3, flute: "B", gramWeights: [200, 160] })],
      }),
      materials: [
        createMaterial({ id: "liner-200", paperKind: "linerboard", gramWeightGsm: 200 }),
        createMaterial({
          id: "corr-b-160",
          paperKind: "corrugating",
          gramWeightGsm: 160,
          applicableFlutes: ["B"],
        }),
      ],
    });

    expect(JSON.stringify(result)).not.toMatch(
      /taxIncludedCostYuan|strength|isQualified|eligible|historicalCost|historicalPrice/i,
    );
  });

  it("历史候选进入 evaluateMatchingCandidates 后强度不足仍为 rejected", () => {
    const candidate = createDefaultCandidate();
    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [candidate],
      evaluateCandidateFn: ({ candidate }) =>
        createRejectedEvaluation(candidate, {
          type: "STRENGTH_UNQUALIFIED",
          code: "ECT_TOO_LOW",
          message: "边压不足",
        }),
    });

    expect(result.rejectedCandidates).toEqual([
      expect.objectContaining({
        status: "rejected",
        reasons: [expect.objectContaining({ type: "STRENGTH_UNQUALIFIED" })],
      }),
    ]);
  });

  it("历史候选进入 evaluateMatchingCandidates 后设备不可生产仍为 rejected", () => {
    const candidate = createDefaultCandidate();
    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [candidate],
      evaluateCandidateFn: ({ candidate }) =>
        createRejectedEvaluation(candidate, {
          type: "NOT_MANUFACTURABLE",
          code: "BOARD_WIDTH_TOO_LARGE",
          message: "纸板宽超过设备限制",
        }),
    });

    expect(result.rejectedCandidates).toEqual([
      expect.objectContaining({
        status: "rejected",
        reasons: [expect.objectContaining({ type: "NOT_MANUFACTURABLE" })],
      }),
    ]);
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
    layerCount: 3,
    flute: "B",
    factoryNames: ["脱敏纸厂A"],
    gramWeights: [200, 160],
    orderCount: 8,
    frequency: 0.62,
    ...overrides,
  };
}

function createMaterial(
  overrides: Partial<RecommendablePaperMaterial> = {},
): RecommendablePaperMaterial {
  return {
    id: "paper-1",
    paperCode: "PAPER-1",
    factoryId: "factory-a",
    factoryName: "脱敏纸厂A",
    name: "虚构原纸",
    paperKind: "linerboard",
    gramWeightGsm: 200,
    applicableFlutes: [],
    priceYuanPerTon: 3_000,
    burstIndex: 10,
    ringCrushIndex: 20,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

function createDefaultCandidate(): MatchingCandidate {
  return {
    id: "default-candidate",
    layerCount: 3,
    fluteType: "B",
    layers: [
      {
        role: "outer_liner",
        paper: toCandidatePaper(createMaterial({ id: "liner-200", paperKind: "linerboard" })),
      },
      {
        role: "corrugating",
        flute: "B",
        paper: toCandidatePaper(
          createMaterial({
            id: "corr-b-160",
            paperKind: "corrugating",
            gramWeightGsm: 160,
            applicableFlutes: ["B"],
          }),
        ),
      },
      {
        role: "inner_liner",
        paper: toCandidatePaper(createMaterial({ id: "liner-200", paperKind: "linerboard" })),
      },
    ],
  };
}

function toCandidatePaper(material: RecommendablePaperMaterial) {
  return {
    id: material.id,
    paperCode: material.paperCode,
    factoryName: material.factoryName,
    name: material.name,
    gramWeightGsm: material.gramWeightGsm,
    priceYuanPerTon: material.priceYuanPerTon,
    burstIndex: material.burstIndex,
    ringCrushIndex: material.ringCrushIndex,
  };
}

function createBoxSpec(): NormalizedBoxSpec {
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
  };
}

function createRejectedEvaluation(
  candidate: MatchingCandidate,
  reason: RejectionReason,
): CandidateEvaluation {
  return {
    status: "rejected",
    candidate,
    reasons: [reason],
  };
}
