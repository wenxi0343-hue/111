import { describe, expect, it } from "vitest";

import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import {
  calculateSafetySurplusRate,
  createCandidateFingerprint,
  scoreBalancedCandidates,
  sortCandidatesByEconomy,
  sortCandidatesBySafety,
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

function createCandidate(id: string, paperIdPrefix = id): MatchingCandidate {
  return {
    id,
    layerCount: 3,
    fluteType: "B",
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
        flute: "B",
        paper: {
          id: `${paperIdPrefix}-corrugating`,
          paperCode: `${paperIdPrefix}-W1`,
          gramWeightGsm: 160,
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

function createEligibleEvaluation(input: {
  id: string;
  costYuan: number;
  bctN: number;
  paperIdPrefix?: string;
}): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: createCandidate(input.id, input.paperIdPrefix),
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

  it("sorts economy candidates by lower tax-included cost first", () => {
    const lowerCost = createEligibleEvaluation({ id: "lower-cost", costYuan: 2.1, bctN: 600 });
    const higherCost = createEligibleEvaluation({ id: "higher-cost", costYuan: 2.3, bctN: 600 });

    const sorted = sortCandidatesByEconomy([higherCost, lowerCost], DEFAULT_CALCULATION_PARAMETERS);

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "lower-cost",
      "higher-cost",
    ]);
  });

  it("uses lower safety surplus as the economy tie breaker when costs are equal", () => {
    const lowerSurplus = createEligibleEvaluation({ id: "lower-surplus", costYuan: 2.1, bctN: 440 });
    const higherSurplus = createEligibleEvaluation({
      id: "higher-surplus",
      costYuan: 2.1,
      bctN: 720,
    });

    const sorted = sortCandidatesByEconomy(
      [higherSurplus, lowerSurplus],
      DEFAULT_CALCULATION_PARAMETERS,
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual([
      "lower-surplus",
      "higher-surplus",
    ]);
  });

  it("calculates safety surplus from BCT and layer threshold", () => {
    const evaluation = createEligibleEvaluation({ id: "strong", costYuan: 2.1, bctN: 1200 });

    expect(calculateSafetySurplusRate(evaluation, DEFAULT_CALCULATION_PARAMETERS)).toBe(3);
  });

  it("sorts safety candidates by higher surplus and filters candidates over 200%", () => {
    const medium = createEligibleEvaluation({ id: "medium", costYuan: 2.1, bctN: 600 });
    const high = createEligibleEvaluation({ id: "high", costYuan: 2.2, bctN: 720 });
    const overLimit = createEligibleEvaluation({ id: "over-limit", costYuan: 2.0, bctN: 804 });

    const sorted = sortCandidatesBySafety(
      [medium, overLimit, high],
      DEFAULT_CALCULATION_PARAMETERS,
    );

    expect(sorted.map((evaluation) => evaluation.candidate.id)).toEqual(["high", "medium"]);
  });

  it("uses default 50/50 weights for balanced scoring", () => {
    const lowCost = createEligibleEvaluation({ id: "low-cost", costYuan: 2, bctN: 400 });
    const highSafety = createEligibleEvaluation({ id: "high-safety", costYuan: 4, bctN: 800 });

    const scores = scoreBalancedCandidates(
      [lowCost, highSafety],
      DEFAULT_CALCULATION_PARAMETERS,
    );

    expect(scores.map((score) => score.balancedScore)).toEqual([0.5, 0.5]);
  });

  it("uses full cost score when all candidate costs are equal", () => {
    const first = createEligibleEvaluation({ id: "first", costYuan: 2.1, bctN: 400 });
    const second = createEligibleEvaluation({ id: "second", costYuan: 2.1, bctN: 800 });

    const scores = scoreBalancedCandidates([first, second], DEFAULT_CALCULATION_PARAMETERS);

    expect(scores.map((score) => score.costScore)).toEqual([1, 1]);
    expect(scores.every((score) => Number.isFinite(score.balancedScore))).toBe(true);
  });

  it("uses full safety score when all candidate surplus rates are equal", () => {
    const first = createEligibleEvaluation({ id: "first", costYuan: 2.1, bctN: 600 });
    const second = createEligibleEvaluation({ id: "second", costYuan: 2.5, bctN: 600 });

    const scores = scoreBalancedCandidates([first, second], DEFAULT_CALCULATION_PARAMETERS);

    expect(scores.map((score) => score.safetyScore)).toEqual([1, 1]);
    expect(scores.every((score) => Number.isFinite(score.balancedScore))).toBe(true);
  });

  it("caps balanced safety scoring at 200% surplus", () => {
    const baseline = createEligibleEvaluation({ id: "baseline", costYuan: 2.1, bctN: 400 });
    const capped = createEligibleEvaluation({ id: "capped", costYuan: 2.1, bctN: 1200 });
    const exactlyLimit = createEligibleEvaluation({ id: "exactly-limit", costYuan: 2.1, bctN: 800 });

    const scores = scoreBalancedCandidates(
      [baseline, capped, exactlyLimit],
      DEFAULT_CALCULATION_PARAMETERS,
    );

    expect(scores.find((score) => score.evaluation.candidate.id === "capped")?.safetyScore).toBe(
      scores.find((score) => score.evaluation.candidate.id === "exactly-limit")?.safetyScore,
    );
  });
});
