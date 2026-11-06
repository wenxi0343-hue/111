import { describe, expect, it } from "vitest";

import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import { PRODUCT_TYPES } from "@/modules/box-spec/constants";
import type {
  BoardAreaResult,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  FluteType,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import {
  createCandidateFingerprint,
  sortCandidatesByStandard,
} from "@/modules/recommendation/scoring";

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

function createCandidate(
  id: string,
  paperIdPrefix = id,
  options: {
    corrugatingGramWeightGsm?: number;
    fluteType?: Extract<FluteType, "A" | "B" | "C" | "E">;
  } = {},
): MatchingCandidate {
  const fluteType = options.fluteType ?? "B";

  return {
    id,
    layerCount: 3,
    fluteType,
    layers: [
      createLayer({
        role: "outer_liner",
        paper: {
          id: `${paperIdPrefix}-outer`,
          paperCode: `${paperIdPrefix}-P1`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: fluteType,
        paper: {
          id: `${paperIdPrefix}-corrugating`,
          paperCode: `${paperIdPrefix}-W1`,
          gramWeightGsm: options.corrugatingGramWeightGsm ?? 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: `${paperIdPrefix}-inner`,
          paperCode: `${paperIdPrefix}-P2`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
    ],
  };
}

function createFiveLayerCandidate(
  id: string,
  fluteType: Extract<FluteType, "BC" | "BE">,
  options: {
    outerWeightGsm?: number;
    firstCorrugatingWeightGsm?: number;
    mediumWeightGsm?: number;
    secondCorrugatingWeightGsm?: number;
    innerWeightGsm?: number;
  } = {},
): MatchingCandidate {
  const [firstFlute, secondFlute] = fluteType.split("") as ["B", "C" | "E"];

  return {
    id,
    layerCount: 5,
    fluteType,
    layers: [
      createLayer({
        role: "outer_liner",
        paper: {
          id: `${id}-outer`,
          paperCode: `${id}-P1`,
          gramWeightGsm: options.outerWeightGsm ?? 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: firstFlute,
        paper: {
          id: `${id}-corrugating-1`,
          paperCode: `${id}-W1`,
          gramWeightGsm: options.firstCorrugatingWeightGsm ?? 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "medium",
        paper: {
          id: `${id}-medium`,
          paperCode: `${id}-M1`,
          gramWeightGsm: options.mediumWeightGsm ?? 140,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: secondFlute,
        paper: {
          id: `${id}-corrugating-2`,
          paperCode: `${id}-W2`,
          gramWeightGsm: options.secondCorrugatingWeightGsm ?? 160,
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
          gramWeightGsm: options.innerWeightGsm ?? 200,
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
  burstStrength?: number;
  edgeCrushKnPerM?: number;
  paperIdPrefix?: string;
  candidate?: MatchingCandidate;
}): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: input.candidate ?? createCandidate(input.id, input.paperIdPrefix),
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

describe("recommendation scoring", () => {
  it("creates the same fingerprint for the same paper combination", () => {
    const first = createEligibleEvaluation({
      id: "candidate-a",
      paperIdPrefix: "same",
      costYuan: 2.1,
      bctN: 440,
    });
    const second = createEligibleEvaluation({
      id: "candidate-b",
      paperIdPrefix: "same",
      costYuan: 2.5,
      bctN: 700,
    });

    expect(createCandidateFingerprint(first)).toBe(createCandidateFingerprint(second));
  });

  it("keeps BC before BE for normal five-layer standard candidates even when BE is closer to the surplus target", () => {
    const primaryFlute = createEligibleEvaluation({
      id: "primary-bc-flute",
      costYuan: 3.2,
      bctN: 880,
      burstStrength: 220,
      edgeCrushKnPerM: 7.7,
      candidate: createFiveLayerCandidate("primary-bc-flute", "BC"),
    });
    const secondaryFluteCloserToTarget = createEligibleEvaluation({
      id: "secondary-be-flute",
      costYuan: 3,
      bctN: 1040,
      burstStrength: 260,
      edgeCrushKnPerM: 9.1,
      candidate: createFiveLayerCandidate("secondary-be-flute", "BE"),
    });

    const sorted = sortCandidatesByStandard(
      [secondaryFluteCloserToTarget, primaryFlute],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "primary-bc-flute",
      "secondary-be-flute",
    ]);
  });

  it("keeps practical five-layer liner weights before overbuilt standard candidates", () => {
    const practical = createEligibleEvaluation({
      id: "practical-bc",
      costYuan: 3.2,
      bctN: 880,
      burstStrength: 220,
      edgeCrushKnPerM: 7.7,
      candidate: createFiveLayerCandidate("practical-bc", "BC", {
        outerWeightGsm: 200,
        firstCorrugatingWeightGsm: 105,
        mediumWeightGsm: 105,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 180,
      }),
    });
    const overbuiltCloserToTarget = createEligibleEvaluation({
      id: "overbuilt-bc",
      costYuan: 3,
      bctN: 1040,
      burstStrength: 260,
      edgeCrushKnPerM: 9.1,
      candidate: createFiveLayerCandidate("overbuilt-bc", "BC", {
        outerWeightGsm: 360,
        firstCorrugatingWeightGsm: 220,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 220,
        innerWeightGsm: 360,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [overbuiltCloserToTarget, practical],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "practical-bc",
      "overbuilt-bc",
    ]);
  });

  it("prefers common five-layer BC total gram weight over heavier ordinary candidates", () => {
    const commonTotal = createEligibleEvaluation({
      id: "common-total-bc",
      costYuan: 3.4,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("common-total-bc", "BC", {
        outerWeightGsm: 200,
        firstCorrugatingWeightGsm: 120,
        mediumWeightGsm: 105,
        secondCorrugatingWeightGsm: 120,
        innerWeightGsm: 190,
      }),
    });
    const heavierOrdinary = createEligibleEvaluation({
      id: "heavier-ordinary-bc",
      costYuan: 3.1,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("heavier-ordinary-bc", "BC", {
        outerWeightGsm: 250,
        firstCorrugatingWeightGsm: 150,
        mediumWeightGsm: 300,
        secondCorrugatingWeightGsm: 150,
        innerWeightGsm: 240,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [heavierOrdinary, commonTotal],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "common-total-bc",
      "heavier-ordinary-bc",
    ]);
  });

  it("does not prefer 300g five-layer BC liners over a common total gram weight candidate", () => {
    const commonTotal = createEligibleEvaluation({
      id: "common-total-bc",
      costYuan: 3.4,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("common-total-bc", "BC", {
        outerWeightGsm: 250,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 250,
      }),
    });
    const overbuiltLiners = createEligibleEvaluation({
      id: "overbuilt-300g-bc",
      costYuan: 3.1,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("overbuilt-300g-bc", "BC", {
        outerWeightGsm: 300,
        firstCorrugatingWeightGsm: 180,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 180,
        innerWeightGsm: 300,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [overbuiltLiners, commonTotal],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "common-total-bc",
      "overbuilt-300g-bc",
    ]);
  });

  it("does not prefer low total gram weight when corrugating paper is heavier than liners", () => {
    const practical = createEligibleEvaluation({
      id: "practical-bc",
      costYuan: 3.4,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("practical-bc", "BC", {
        outerWeightGsm: 250,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 250,
      }),
    });
    const invalidLowTotal = createEligibleEvaluation({
      id: "invalid-low-total-bc",
      costYuan: 3.1,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("invalid-low-total-bc", "BC", {
        outerWeightGsm: 135,
        firstCorrugatingWeightGsm: 180,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 160,
        innerWeightGsm: 135,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [invalidLowTotal, practical],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "practical-bc",
      "invalid-low-total-bc",
    ]);
  });

  it("does not prefer 150g liners for a 25kg ordinary five-layer BC box", () => {
    const commonLiner = createEligibleEvaluation({
      id: "common-liner-bc",
      costYuan: 3.4,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("common-liner-bc", "BC", {
        outerWeightGsm: 160,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 160,
      }),
    });
    const lightLiner = createEligibleEvaluation({
      id: "light-150g-liner-bc",
      costYuan: 3.1,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("light-150g-liner-bc", "BC", {
        outerWeightGsm: 150,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 150,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [lightLiner, commonLiner],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "common-liner-bc",
      "light-150g-liner-bc",
    ]);
  });

  it("prefers 190g liners over 160g backup liners for a 25kg ordinary five-layer BC box", () => {
    const commonLiner = createEligibleEvaluation({
      id: "common-190g-liner-bc",
      costYuan: 3.5,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("common-190g-liner-bc", "BC", {
        outerWeightGsm: 190,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 190,
      }),
    });
    const backupLiner = createEligibleEvaluation({
      id: "backup-160g-liner-bc",
      costYuan: 3.1,
      bctN: 900,
      burstStrength: 230,
      edgeCrushKnPerM: 8,
      candidate: createFiveLayerCandidate("backup-160g-liner-bc", "BC", {
        outerWeightGsm: 160,
        firstCorrugatingWeightGsm: 140,
        mediumWeightGsm: 100,
        secondCorrugatingWeightGsm: 140,
        innerWeightGsm: 160,
      }),
    });

    const sorted = sortCandidatesByStandard(
      [backupLiner, commonLiner],
      DEFAULT_CALCULATION_PARAMETERS,
      {},
      createBoxSpec(),
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "common-190g-liner-bc",
      "backup-160g-liner-bc",
    ]);
  });
});

function createBoxSpec(): NormalizedBoxSpec {
  return {
    lengthMm: 200,
    widthMm: 200,
    heightMm: 200,
    structureType: "0201",
    formingMethod: "glue",
    productType: PRODUCT_TYPES[2]!,
    productWeightKg: 25,
    arrangement: "single_row",
    specialRequirements: {
      dieCutting: false,
      punctureStrengthRequired: false,
    },
    productionQuantity: 1_000,
    stackingRequirement: {
      status: "not_required",
      displayText: "\u672a\u586b\u5199\u5806\u7801\u5c42\u6570\uff0c\u627f\u91cd\u672a\u6821\u6838",
    },
  };
}
