import { describe, expect, it } from "vitest";

import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  EvaluateMatchingCandidatesResult,
  MatchingCandidate,
  RejectedCandidateEvaluation,
  StrengthResult,
} from "@/modules/calculations/types";
import { selectMatchingRecommendations } from "@/modules/recommendation/select-matching-recommendations";

function createLayer(overrides: Partial<CandidateLayer>): CandidateLayer {
  return {
    role: "outer_liner",
    paper: {
      id: "paper-1",
      paperCode: "P1",
      gramWeightGsm: 200,
      priceYuanPerTon: 3000,
      burstIndex: 10,
      ringCrushIndex: 20,
    },
    ...overrides,
  };
}

function createCandidate(id: string): MatchingCandidate {
  return {
    id,
    layerCount: 3,
    fluteType: "B",
    layers: [
      createLayer({
        role: "outer_liner",
        paper: {
          id: `${id}-outer`,
          paperCode: `${id}-P1`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: "B",
        paper: {
          id: `${id}-corrugating`,
          paperCode: `${id}-W1`,
          gramWeightGsm: 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: `${id}-inner`,
          paperCode: `${id}-P2`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
    ],
  };
}

function createEligibleEvaluation(input: {
  id: string;
  costYuan: number;
  bctN: number;
}): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: createCandidate(input.id),
    area: {} as BoardAreaResult,
    device: {
      isManufacturable: true,
      reasons: [],
    } satisfies DeviceLimitResult,
    strength: {
      burstStrength: 3800,
      edgeCrushNPerM: 4500,
      edgeCrushKnPerM: 4.5,
      bctN: input.bctN,
      isQualified: true,
      reasons: [],
    } satisfies StrengthResult,
    cost: {
      utilizationRate: 0.88,
      padFeeYuan: 0,
      layerUnitPrices: [],
      paperCostYuan: 1,
      processingFeeYuan: 1,
      taxYuan: 0.1,
      taxIncludedCostYuan: input.costYuan,
    } satisfies CostResult,
  };
}

function createRejectedEvaluation(input: {
  id: string;
  costYuan: number;
  bctN: number;
  reasons?: RejectedCandidateEvaluation["reasons"];
}): RejectedCandidateEvaluation {
  const reasons = input.reasons ?? [
    {
      type: "STRENGTH_UNQUALIFIED",
      code: "ECT_TOO_LOW",
      message: "边压不足",
    },
  ];

  return {
    status: "rejected",
    candidate: createCandidate(input.id),
    reasons,
    area: {} as BoardAreaResult,
    device: {
      isManufacturable: !reasons.some((reason) => reason.type === "NOT_MANUFACTURABLE"),
      reasons: reasons.filter((reason) => reason.type === "NOT_MANUFACTURABLE"),
    },
    strength: {
      burstStrength: 3800,
      edgeCrushNPerM: 3500,
      edgeCrushKnPerM: 3.5,
      bctN: input.bctN,
      isQualified: false,
      reasons: reasons.filter((reason) => reason.type === "STRENGTH_UNQUALIFIED"),
    },
    cost: {
      utilizationRate: 0.88,
      padFeeYuan: 0,
      layerUnitPrices: [],
      paperCostYuan: 1,
      processingFeeYuan: 1,
      taxYuan: 0.1,
      taxIncludedCostYuan: input.costYuan,
    },
  };
}

function createRejectedWithoutDisplayData(id: string): RejectedCandidateEvaluation {
  return {
    status: "rejected",
    candidate: createCandidate(id),
    reasons: [
      {
        type: "DATA_MISSING",
        code: "PAPER_PRICE_MISSING",
        message: "缺少原纸价格",
      },
    ],
  };
}

function createEvaluationResult(input: {
  eligibleCandidates: EligibleCandidateEvaluation[];
  rejectedCandidates?: RejectedCandidateEvaluation[];
}): EvaluateMatchingCandidatesResult {
  return {
    eligibleCandidates: input.eligibleCandidates,
    rejectedCandidates: input.rejectedCandidates ?? [],
    rejectedSummary: [],
  };
}

describe("selectMatchingRecommendations", () => {
  it("returns fixed economy, safety, and balanced slots", () => {
    const economy = createEligibleEvaluation({ id: "economy", costYuan: 2.1, bctN: 520 });
    const safety = createEligibleEvaluation({ id: "safety", costYuan: 2.5, bctN: 760 });
    const balanced = createEligibleEvaluation({ id: "balanced", costYuan: 2.3, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [safety, balanced, economy],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots).toHaveLength(3);
    expect(result.slots.map((slot) => slot.title)).toEqual(["经济型", "安全型", "均衡型"]);
  });

  it("selects the lowest tax-included cost for the economy slot", () => {
    const lowCost = createEligibleEvaluation({ id: "low-cost", costYuan: 2.1, bctN: 520 });
    const midCost = createEligibleEvaluation({ id: "mid-cost", costYuan: 2.3, bctN: 640 });
    const highCost = createEligibleEvaluation({ id: "high-cost", costYuan: 2.5, bctN: 760 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [highCost, midCost, lowCost],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[0].evaluation?.candidate.id).toBe("low-cost");
  });

  it("selects the highest safety surplus at or under 200% for the safety slot", () => {
    const medium = createEligibleEvaluation({ id: "medium", costYuan: 2.1, bctN: 520 });
    const high = createEligibleEvaluation({ id: "high", costYuan: 2.3, bctN: 760 });
    const overLimit = createEligibleEvaluation({ id: "over-limit", costYuan: 2.0, bctN: 840 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [medium, overLimit, high],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[1].evaluation?.candidate.id).toBe("high");
  });

  it("selects the highest balanced score for the balanced slot", () => {
    const cheapest = createEligibleEvaluation({ id: "cheapest", costYuan: 2, bctN: 420 });
    const safest = createEligibleEvaluation({ id: "safest", costYuan: 4, bctN: 800 });
    const balanced = createEligibleEvaluation({ id: "balanced", costYuan: 2.8, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [cheapest, safest, balanced],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[2].evaluation?.candidate.id).toBe("balanced");
  });

  it("marks three different best strategy candidates as recommended", () => {
    const economy = createEligibleEvaluation({ id: "economy", costYuan: 2, bctN: 420 });
    const safety = createEligibleEvaluation({ id: "safety", costYuan: 4, bctN: 800 });
    const balanced = createEligibleEvaluation({ id: "balanced", costYuan: 2.8, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [economy, safety, balanced],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots.map((slot) => slot.status)).toEqual([
      "recommended",
      "recommended",
      "recommended",
    ]);
    expect(new Set(result.slots.map((slot) => slot.evaluation?.candidate.id)).size).toBe(3);
  });

  it("does not select rejected candidates for economy or safety slots", () => {
    const eligible = createEligibleEvaluation({ id: "eligible", costYuan: 3, bctN: 600 });
    const rejectedLowCost = createRejectedEvaluation({
      id: "rejected-low-cost",
      costYuan: 1,
      bctN: 600,
    });
    const rejectedHighSafety = createRejectedEvaluation({
      id: "rejected-high-safety",
      costYuan: 3,
      bctN: 900,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [eligible],
        rejectedCandidates: [rejectedLowCost, rejectedHighSafety],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[0].evaluation?.candidate.id).not.toBe("rejected-low-cost");
    expect(result.slots[1].evaluation?.candidate.id).not.toBe("rejected-high-safety");
  });

  it("does not include historical habit or AI generated fields", () => {
    const economy = createEligibleEvaluation({ id: "economy", costYuan: 2.1, bctN: 520 });
    const safety = createEligibleEvaluation({ id: "safety", costYuan: 2.5, bctN: 760 });
    const balanced = createEligibleEvaluation({ id: "balanced", costYuan: 2.3, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [economy, safety, balanced],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    const serializedResult = JSON.stringify(result);

    expect(serializedResult).not.toContain("historicalHabitScore");
    expect(serializedResult).not.toContain("historicalReason");
    expect(serializedResult).not.toContain("aiReason");
    expect(serializedResult).not.toContain("aiGeneratedReason");
  });

  it("uses the next different safety candidate when the best safety candidate is already used", () => {
    const economyAndSafety = createEligibleEvaluation({
      id: "economy-and-safety",
      costYuan: 2,
      bctN: 760,
    });
    const safetyFallback = createEligibleEvaluation({
      id: "safety-fallback",
      costYuan: 2.2,
      bctN: 680,
    });
    const balanced = createEligibleEvaluation({ id: "balanced", costYuan: 2.3, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [economyAndSafety, safetyFallback, balanced],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[1].evaluation?.candidate.id).toBe("safety-fallback");
    expect(result.slots[1].status).toBe("recommended");
  });

  it("marks repeated slots when only one eligible candidate can fill all strategies", () => {
    const onlyCandidate = createEligibleEvaluation({ id: "only-candidate", costYuan: 2, bctN: 640 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [onlyCandidate],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots.map((slot) => slot.evaluation?.candidate.id)).toEqual([
      "only-candidate",
      "only-candidate",
      "only-candidate",
    ]);
    expect(result.slots.map((slot) => slot.status)).toEqual([
      "recommended",
      "repeated",
      "repeated",
    ]);
    expect(result.slots[1].messages).toContain("该组合同时也是某策略下最优");
  });

  it("returns an unavailable safety slot when every eligible candidate exceeds the safety surplus cap", () => {
    const overLimit = createEligibleEvaluation({ id: "over-limit", costYuan: 2, bctN: 820 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [overLimit],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[1].status).toBe("unavailable");
    expect(result.slots[1].isOfficialRecommendation).toBe(false);
    expect(result.slots[1].evaluation).toBeUndefined();
    expect(result.slots[1].unavailableReasons.map((reason) => reason.message)).toContain(
      "所有安全型候选抗压富余率超过 200% 上限",
    );
  });

  it("keeps three slots when only two different eligible candidates exist", () => {
    const lowCost = createEligibleEvaluation({ id: "low-cost", costYuan: 2, bctN: 640 });
    const highSafety = createEligibleEvaluation({ id: "high-safety", costYuan: 2.5, bctN: 760 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [lowCost, highSafety],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots).toHaveLength(3);
    expect(result.slots[2].status).toBe("repeated");
    expect(result.slots[2].messages).toContain("该组合同时也是某策略下最优");
  });

  it("returns reference slots and the global reference message when no eligible candidate exists", () => {
    const lowerCost = createRejectedEvaluation({ id: "lower-cost", costYuan: 2.1, bctN: 600 });
    const higherSafety = createRejectedEvaluation({ id: "higher-safety", costYuan: 2.3, bctN: 800 });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [higherSafety, lowerCost],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots).toHaveLength(3);
    expect(result.slots.some((slot) => slot.status === "reference")).toBe(true);
    expect(result.globalMessages).toContain("当前没有达标可生产方案，以下仅供调整参考");
    expect(result.slots[0].evaluation?.candidate.id).toBe("lower-cost");
    expect(result.slots[1].evaluation?.candidate.id).toBe("higher-safety");
    expect(result.slots.every((slot) => slot.isOfficialRecommendation === false)).toBe(true);
  });

  it("selects the balanced reference candidate with the fewest reasons when cost and strength exist", () => {
    const oneReason = createRejectedEvaluation({ id: "one-reason", costYuan: 2.5, bctN: 600 });
    const twoReasons = createRejectedEvaluation({
      id: "two-reasons",
      costYuan: 2.1,
      bctN: 800,
      reasons: [
        {
          type: "STRENGTH_UNQUALIFIED",
          code: "BCT_TOO_LOW",
          message: "空箱抗压不足",
        },
        {
          type: "NOT_MANUFACTURABLE",
          code: "BOARD_WIDTH_TOO_LARGE",
          message: "纸板宽超过设备限制",
        },
      ],
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [twoReasons, oneReason],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots[2].evaluation?.candidate.id).toBe("one-reason");
  });

  it("keeps strength and device reasons visible on reference slots", () => {
    const strengthRejected = createRejectedEvaluation({
      id: "strength-rejected",
      costYuan: 2.1,
      bctN: 600,
      reasons: [
        {
          type: "STRENGTH_UNQUALIFIED",
          code: "ECT_TOO_LOW",
          message: "边压不足",
        },
      ],
    });
    const deviceRejected = createRejectedEvaluation({
      id: "device-rejected",
      costYuan: 2.3,
      bctN: 800,
      reasons: [
        {
          type: "NOT_MANUFACTURABLE",
          code: "BOARD_WIDTH_TOO_LARGE",
          message: "纸板宽超过设备限制",
        },
      ],
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [strengthRejected, deviceRejected],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    const visibleReasons = result.slots.flatMap((slot) =>
      slot.unavailableReasons.map((reason) => reason.message),
    );

    expect(visibleReasons).toContain("边压不足");
    expect(visibleReasons).toContain("纸板宽超过设备限制");
  });

  it("returns unavailable slots when rejected candidates have no displayable calculation result", () => {
    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [createRejectedWithoutDisplayData("missing-data")],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.slots.map((slot) => slot.status)).toEqual([
      "unavailable",
      "unavailable",
      "unavailable",
    ]);
    expect(result.slots.every((slot) => slot.isOfficialRecommendation === false)).toBe(true);
    expect(result.slots[0].unavailableReasons.map((reason) => reason.message)).toContain(
      "没有可展示的参考方案",
    );
  });
});
