import { describe, expect, it } from "vitest";

import { PRODUCT_TYPES } from "@/modules/box-spec/constants";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  EvaluateMatchingCandidatesResult,
  FluteType,
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

function createCandidate(input: {
  id: string;
  fluteType?: Extract<FluteType, "A" | "B" | "C" | "E">;
  outerWeight?: number;
  corrugatingWeight?: number;
  innerWeight?: number;
}): MatchingCandidate {
  const fluteType = input.fluteType ?? "B";

  return {
    id: input.id,
    layerCount: 3,
    fluteType,
    layers: [
      createLayer({
        role: "outer_liner",
        paper: {
          id: `${input.id}-outer`,
          paperCode: `${input.id}-P1`,
          gramWeightGsm: input.outerWeight ?? 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: fluteType,
        paper: {
          id: `${input.id}-corrugating`,
          paperCode: `${input.id}-W1`,
          gramWeightGsm: input.corrugatingWeight ?? 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: `${input.id}-inner`,
          paperCode: `${input.id}-P2`,
          gramWeightGsm: input.innerWeight ?? 200,
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
  burstStrength?: number | undefined;
  edgeCrushKnPerM?: number | undefined;
  candidate?: MatchingCandidate | undefined;
  strengthRequirement?:
    | {
        minBctN: number;
        minEdgeCrushKnPerM: number;
        minBurstStrength: number;
      }
    | undefined;
}): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: input.candidate ?? createCandidate({ id: input.id }),
    area: {} as BoardAreaResult,
    device: {
      isManufacturable: true,
      reasons: [],
    } satisfies DeviceLimitResult,
    strength: {
      burstStrength: input.burstStrength ?? 3800,
      edgeCrushNPerM: (input.edgeCrushKnPerM ?? 4.5) * 1000,
      edgeCrushKnPerM: input.edgeCrushKnPerM ?? 4.5,
      bctN: input.bctN,
      isQualified: true,
      reasons: [],
      ...(input.strengthRequirement ? { requirement: input.strengthRequirement } : {}),
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
    candidate: createCandidate({ id: input.id }),
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
    candidate: createCandidate({ id }),
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
  it("returns standard and cost-down slots for a normal order", () => {
    const standard = createEligibleEvaluation({
      id: "standard",
      costYuan: 2.3,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
    });
    const costDown = createEligibleEvaluation({
      id: "cost-down",
      costYuan: 2.1,
      bctN: 460,
      burstStrength: 115,
      edgeCrushKnPerM: 4.6,
    });
    const excessive = createEligibleEvaluation({
      id: "excessive",
      costYuan: 2.6,
      bctN: 760,
      burstStrength: 190,
      edgeCrushKnPerM: 7.6,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [costDown, excessive, standard],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots.map((slot) => slot.strategy)).toEqual(["standard", "cost_down"]);
    expect(result.slots.map((slot) => slot.title)).toEqual(["标准方案", "降本方案"]);
    expect(result.slots[0]!.evaluation?.candidate.id).toBe("standard");
    expect(result.slots[1]!.evaluation?.candidate.id).toBe("cost-down");
  });

  it("adds an enhanced slot when special requirements are present", () => {
    const standard = createEligibleEvaluation({
      id: "standard",
      costYuan: 2.3,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
    });
    const costDown = createEligibleEvaluation({
      id: "cost-down",
      costYuan: 2.1,
      bctN: 460,
      burstStrength: 115,
      edgeCrushKnPerM: 4.6,
    });
    const enhanced = createEligibleEvaluation({
      id: "enhanced",
      costYuan: 2.7,
      bctN: 700,
      burstStrength: 175,
      edgeCrushKnPerM: 7,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [costDown, enhanced, standard],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec({
        specialRequirements: {
          dieCutting: false,
          punctureStrengthRequired: false,
          notes: "贵重物品",
        },
      }),
    });

    expect(result.slots.map((slot) => slot.strategy)).toEqual([
      "standard",
      "cost_down",
      "enhanced",
    ]);
    expect(result.slots[2]!.title).toBe("增强方案");
    expect(result.slots[2]!.evaluation?.candidate.id).toBe("enhanced");
  });

  it("uses the weakest strength surplus to choose a standard candidate in the target range", () => {
    const cheapButNearLimit = createEligibleEvaluation({
      id: "cheap-but-near-limit",
      costYuan: 2.1,
      bctN: 420,
      burstStrength: 105,
      edgeCrushKnPerM: 4.2,
    });
    const inTarget = createEligibleEvaluation({
      id: "in-target",
      costYuan: 2.3,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
    });
    const tooStrong = createEligibleEvaluation({
      id: "too-strong",
      costYuan: 2.6,
      bctN: 760,
      burstStrength: 190,
      edgeCrushKnPerM: 7.6,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [cheapButNearLimit, tooStrong, inTarget],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots[0]!.evaluation?.candidate.id).toBe("in-target");
  });

  it("uses the dynamic strength requirement instead of the static layer threshold for standard surplus", () => {
    const dynamicRequirement = {
      minBctN: 600,
      minEdgeCrushKnPerM: 6,
      minBurstStrength: 150,
    };
    const staticThresholdTargetOnly = createEligibleEvaluation({
      id: "static-threshold-target-only",
      costYuan: 2.1,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      strengthRequirement: dynamicRequirement,
    });
    const dynamicTarget = createEligibleEvaluation({
      id: "dynamic-target",
      costYuan: 2.4,
      bctN: 700,
      burstStrength: 175,
      edgeCrushKnPerM: 7,
      strengthRequirement: dynamicRequirement,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [staticThresholdTargetOnly, dynamicTarget],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec({
        productWeightKg: 19,
        stackingRequirement: {
          status: "required",
          stackingLayers: 5,
          displayText: "stacking 5 layers",
        },
      }),
    });

    expect(result.slots[0]!.evaluation?.candidate.id).toBe("dynamic-target");
  });

  it("only accepts cost-down candidates cheaper than standard and at least 90% as strong", () => {
    const standard = createEligibleEvaluation({
      id: "standard",
      costYuan: 2.3,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
    });
    const tooWeak = createEligibleEvaluation({
      id: "too-weak",
      costYuan: 2,
      bctN: 430,
      burstStrength: 107,
      edgeCrushKnPerM: 4.3,
    });
    const cheaperButStrongEnough = createEligibleEvaluation({
      id: "cheaper-strong-enough",
      costYuan: 2.1,
      bctN: 455,
      burstStrength: 114,
      edgeCrushKnPerM: 4.55,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [tooWeak, cheaperButStrongEnough, standard],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots[1]!.evaluation?.candidate.id).toBe("cheaper-strong-enough");
  });

  it("prefers cost-down changes on corrugating paper before reducing liners", () => {
    const standard = createEligibleEvaluation({
      id: "standard",
      costYuan: 2.3,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      candidate: createCandidate({
        id: "standard",
        outerWeight: 200,
        corrugatingWeight: 160,
        innerWeight: 200,
      }),
    });
    const linerReduced = createEligibleEvaluation({
      id: "liner-reduced",
      costYuan: 2.05,
      bctN: 460,
      burstStrength: 115,
      edgeCrushKnPerM: 4.6,
      candidate: createCandidate({
        id: "liner-reduced",
        outerWeight: 190,
        corrugatingWeight: 160,
        innerWeight: 200,
      }),
    });
    const corrugatingReduced = createEligibleEvaluation({
      id: "corrugating-reduced",
      costYuan: 2.1,
      bctN: 460,
      burstStrength: 115,
      edgeCrushKnPerM: 4.6,
      candidate: createCandidate({
        id: "corrugating-reduced",
        outerWeight: 200,
        corrugatingWeight: 150,
        innerWeight: 200,
      }),
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [linerReduced, corrugatingReduced, standard],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots[1]!.evaluation?.candidate.id).toBe("corrugating-reduced");
  });

  it("prefers standard candidates with closer outer and inner liner weights", () => {
    const widerLinerGap = createEligibleEvaluation({
      id: "a-wider-liner-gap",
      costYuan: 2.2,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      candidate: createCandidate({
        id: "a-wider-liner-gap",
        outerWeight: 200,
        innerWeight: 190,
      }),
    });
    const matchedLiners = createEligibleEvaluation({
      id: "z-matched-liners",
      costYuan: 2.2,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      candidate: createCandidate({
        id: "z-matched-liners",
        outerWeight: 200,
        innerWeight: 200,
      }),
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [widerLinerGap, matchedLiners],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots[0]!.evaluation?.candidate.id).toBe("z-matched-liners");
  });

  it("keeps E flute as a light-small-box option instead of a default heavy-duty option", () => {
    const eFlute = createEligibleEvaluation({
      id: "e-flute",
      costYuan: 2.2,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      candidate: createCandidate({ id: "e-flute", fluteType: "E" }),
    });
    const bFlute = createEligibleEvaluation({
      id: "b-flute",
      costYuan: 2.2,
      bctN: 500,
      burstStrength: 125,
      edgeCrushKnPerM: 5,
      candidate: createCandidate({ id: "b-flute", fluteType: "B" }),
    });

    const lightSmallResult = selectMatchingRecommendations({
      evaluation: createEvaluationResult({ eligibleCandidates: [bFlute, eFlute] }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec({
        lengthMm: 250,
        widthMm: 180,
        heightMm: 120,
        productWeightKg: 3,
      }),
    });
    const normalResult = selectMatchingRecommendations({
      evaluation: createEvaluationResult({ eligibleCandidates: [bFlute, eFlute] }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(lightSmallResult.slots[0]!.evaluation?.candidate.id).toBe("e-flute");
    expect(normalResult.slots[0]!.evaluation?.candidate.id).toBe("b-flute");
  });

  it("does not select rejected candidates for official recommendation slots", () => {
    const eligible = createEligibleEvaluation({ id: "eligible", costYuan: 3, bctN: 600 });
    const rejectedLowCost = createRejectedEvaluation({
      id: "rejected-low-cost",
      costYuan: 1,
      bctN: 600,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [eligible],
        rejectedCandidates: [rejectedLowCost],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots.every((slot) => slot.evaluation?.status !== "rejected")).toBe(true);
  });

  it("returns reference slots and the global reference message when no eligible candidate exists", () => {
    const lowerCost = createRejectedEvaluation({ id: "lower-cost", costYuan: 2.1, bctN: 600 });
    const higherStrength = createRejectedEvaluation({
      id: "higher-strength",
      costYuan: 2.3,
      bctN: 800,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [higherStrength, lowerCost],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots).toHaveLength(2);
    expect(result.slots.some((slot) => slot.status === "reference")).toBe(true);
    expect(result.globalMessages).toContain("当前没有达标可生产方案，以下仅供调整参考");
    expect(result.slots[0]!.evaluation?.candidate.id).toBe("higher-strength");
    expect(result.slots[1]!.evaluation?.candidate.id).toBe("lower-cost");
    expect(result.slots.every((slot) => slot.isOfficialRecommendation === false)).toBe(true);
  });

  it("returns three reference slots when no special-order candidate is eligible", () => {
    const lowerCost = createRejectedEvaluation({ id: "lower-cost", costYuan: 2.1, bctN: 600 });
    const higherStrength = createRejectedEvaluation({
      id: "higher-strength",
      costYuan: 2.3,
      bctN: 800,
    });

    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [higherStrength, lowerCost],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec({
        specialRequirements: {
          dieCutting: true,
          punctureStrengthRequired: false,
        },
      }),
    });

    expect(result.slots.map((slot) => slot.strategy)).toEqual([
      "standard",
      "cost_down",
      "enhanced",
    ]);
  });

  it("returns unavailable slots when rejected candidates have no displayable calculation result", () => {
    const result = selectMatchingRecommendations({
      evaluation: createEvaluationResult({
        eligibleCandidates: [],
        rejectedCandidates: [createRejectedWithoutDisplayData("missing-data")],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: createBoxSpec(),
    });

    expect(result.slots.map((slot) => slot.status)).toEqual(["unavailable", "unavailable"]);
    expect(result.slots.every((slot) => slot.isOfficialRecommendation === false)).toBe(true);
    expect(result.slots[0]!.unavailableReasons.map((reason) => reason.message)).toContain(
      "没有可展示的参考方案",
    );
  });
});

function createBoxSpec(overrides: Partial<NormalizedBoxSpec> = {}): NormalizedBoxSpec {
  return {
    lengthMm: 300,
    widthMm: 200,
    heightMm: 150,
    structureType: "0201",
    formingMethod: "glue",
    productType: PRODUCT_TYPES[0]!,
    productWeightKg: 10,
    arrangement: "single_row",
    specialRequirements: {
      dieCutting: false,
      punctureStrengthRequired: false,
    },
    productionQuantity: 1_000,
    stackingRequirement: {
      status: "not_required",
      displayText: "未填写堆码层数，承重未校核",
    },
    ...overrides,
  };
}
