import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import type { SelectionReason } from "@/modules/ai-reasoning/types";
import { createHistorySnapshot } from "@/modules/scheme-adjustment/create-history-snapshot";

function createBoxSpec(): NormalizedBoxSpec {
  return {
    lengthMm: 500,
    widthMm: 300,
    heightMm: 250,
    structureType: "0201",
    formingMethod: "glue",
    productType: "食品",
    productWeightKg: 10,
    arrangement: "single_row",
    specialRequirements: {
      dieCutting: false,
      punctureStrengthRequired: false,
    },
    productionQuantity: 1000,
    stackingRequirement: {
      status: "not_required",
      displayText: "未填写堆码层数，承重未校核",
    },
  };
}

function createCandidate(): MatchingCandidate {
  return {
    id: "economy",
    layerCount: 3,
    fluteType: "B",
    layers: [
      {
        role: "outer_liner",
        paper: {
          id: "outer-paper",
          paperCode: "P1",
          factoryName: "一号纸厂",
          name: "A级面纸",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "corrugating",
        flute: "B",
        paper: {
          id: "corrugating-paper",
          paperCode: "W1",
          factoryName: "二号纸厂",
          name: "B楞瓦纸",
          gramWeightGsm: 160,
          priceYuanPerTon: 2800,
          burstIndex: 8,
          ringCrushIndex: 18,
        },
      },
      {
        role: "inner_liner",
        paper: {
          id: "inner-paper",
          paperCode: "P2",
          factoryName: "三号纸厂",
          name: "里纸",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
    ],
  };
}

function createEligibleEvaluation(
  candidate = createCandidate(),
  costYuan = 2.13,
): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate,
    area: {
      innerLengthMm: 492,
      innerWidthMm: 292,
      innerHeightMm: 242,
      boardLengthMm: 1625,
      boardWidthMm: 548,
      feedLengthMm: 1625,
      feedWidthMm: 548,
      printLengthMm: 1625,
      printWidthMm: 548,
      slotIntervalsMm: {
        firstPanel: 492,
        firstSlot: 292,
        secondPanel: 492,
        secondSlot: 292,
      },
      areaSquareMeters: 0.8905,
      formingPieces: 1,
      flapMm: 150,
      tongueMm: 35,
    } satisfies BoardAreaResult,
    device: {
      isManufacturable: true,
      reasons: [],
    } satisfies DeviceLimitResult,
    strength: {
      burstStrength: 3800,
      edgeCrushNPerM: 4500,
      edgeCrushKnPerM: 4.5,
      bctN: 450,
      isQualified: true,
      reasons: [],
    } satisfies StrengthResult,
    cost: {
      utilizationRate: 0.88,
      padFeeYuan: 0,
      layerUnitPrices: [],
      paperCostYuan: 1.2,
      processingFeeYuan: 0.9,
      taxYuan: 0.03,
      taxIncludedCostYuan: costYuan,
    } satisfies CostResult,
  };
}

function createSlot(strategy: RecommendationSlot["strategy"], costYuan = 2.13): RecommendationSlot {
  return {
    strategy,
    title: strategy === "economy" ? "经济型" : strategy === "safety" ? "安全型" : "均衡型",
    status: "recommended",
    isOfficialRecommendation: true,
    evaluation: createEligibleEvaluation(createCandidate(), costYuan),
    messages: [],
    unavailableReasons: [],
  };
}

function createSelectionReason(sourceLabel: SelectionReason["sourceLabel"], text: string): SelectionReason {
  return {
    source: sourceLabel === "AI 生成" ? "ai" : "template",
    sourceLabel,
    text,
    generatedAt: "2026-07-02T00:00:00.000Z",
  };
}

describe("createHistorySnapshot", () => {
  it("keeps input, production quantity, original recommendations and final scheme", () => {
    const finalEvaluation = createEligibleEvaluation(createCandidate(), 2.13);
    const finalSelectionReason = createSelectionReason("AI 生成", "保存时的最终理由");
    const result = createHistorySnapshot({
      boxSpec: createBoxSpec(),
      originalRecommendationSlots: [
        {
          ...createSlot("economy", 0.01),
          selectionReason: createSelectionReason("AI 生成", "经济型保存理由"),
        },
        {
          ...createSlot("safety", 2.5),
          selectionReason: createSelectionReason("模板生成", "安全型保存理由"),
        },
        {
          ...createSlot("balanced", 2.3),
          selectionReason: createSelectionReason("模板生成", "均衡型保存理由"),
        },
      ],
      selectedStrategy: "economy",
      finalEvaluation,
      selectionReason: finalSelectionReason,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      isManuallyAdjusted: false,
      savedAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history snapshot should succeed");
    }

    expect(result.data.boxSpecSnapshot.productionQuantity).toBe(1000);
    expect(result.data.productionQuantity).toBe(1000);
    expect(result.data.originalRecommendationSlotsSnapshot).toHaveLength(3);
    expect(result.data.originalRecommendationSlotsSnapshot[0]?.evaluation?.cost?.taxIncludedCostYuan).toBe(
      0.01,
    );
    expect(result.data.originalRecommendationSlotsSnapshot.map((slot) => slot.selectionReason?.text)).toEqual([
      "经济型保存理由",
      "安全型保存理由",
      "均衡型保存理由",
    ]);
    expect(result.data.finalSchemeSnapshot).toMatchObject({
      cost: {
        taxIncludedCostYuan: 2.13,
      },
      selectionReason: finalSelectionReason,
    });
    expect(result.data.finalStatus).toBe("qualified");
    expect(result.data.isManuallyAdjusted).toBe(false);
    expect(result.data.parameterVersion).toBe("prd-v1-default");
    expect(result.data.parameterSnapshot).toEqual(DEFAULT_CALCULATION_PARAMETERS);
    expect(result.data.exportRecords).toEqual([]);
    expect(result.data.savedAt).toEqual(new Date("2026-07-02T00:00:00.000Z"));
  });

  it("creates one price snapshot per final scheme layer", () => {
    const result = createHistorySnapshot({
      boxSpec: createBoxSpec(),
      originalRecommendationSlots: [
        createSlot("economy"),
        createSlot("safety"),
        createSlot("balanced"),
      ],
      selectedStrategy: "economy",
      finalEvaluation: createEligibleEvaluation(),
      selectionReason: createSelectionReason("模板生成", "最终理由"),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      isManuallyAdjusted: false,
      savedAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history snapshot should succeed");
    }

    expect(result.data.priceSnapshot).toEqual([
      expect.objectContaining({
        paperMaterialId: "outer-paper",
        paperCode: "P1",
        factoryName: "一号纸厂",
        role: "outer_liner",
        gramWeightGsm: 200,
        priceYuanPerTon: 3000,
        burstIndex: 10,
        ringCrushIndex: 20,
      }),
      expect.objectContaining({
        paperMaterialId: "corrugating-paper",
        paperCode: "W1",
        factoryName: "二号纸厂",
        role: "corrugating",
        flute: "B",
      }),
      expect.objectContaining({
        paperMaterialId: "inner-paper",
        paperCode: "P2",
        factoryName: "三号纸厂",
        role: "inner_liner",
      }),
    ]);
  });

  it("rejects an empty original recommendation result", () => {
    const result = createHistorySnapshot({
      boxSpec: createBoxSpec(),
      originalRecommendationSlots: [],
      selectedStrategy: "economy",
      finalEvaluation: createEligibleEvaluation(),
      selectionReason: createSelectionReason("模板生成", "最终理由"),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      isManuallyAdjusted: false,
      savedAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "原始推荐结果不完整，请重新生成方案",
        details: {
          fieldErrors: [
            {
              field: "originalRecommendationSlots",
              message: "原始推荐结果不完整，请重新生成方案",
            },
          ],
        },
      },
    });
  });
});
