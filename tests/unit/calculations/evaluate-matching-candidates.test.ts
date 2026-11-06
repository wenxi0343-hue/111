import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { evaluateMatchingCandidates } from "@/modules/calculations/evaluate-matching-candidates";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CandidateEvaluation,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  MatchingCandidate,
  RejectionReason,
  StrengthResult,
} from "@/modules/calculations/types";

function createBoxSpec(overrides: Partial<NormalizedBoxSpec> = {}): NormalizedBoxSpec {
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
    ...overrides,
  };
}

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

function createCandidate(overrides: Partial<MatchingCandidate> = {}): MatchingCandidate {
  return {
    id: "candidate-1",
    layerCount: 3,
    fluteType: "B",
    layers: [
      createLayer({ role: "outer_liner" }),
      createLayer({
        role: "corrugating",
        flute: "B",
        paper: {
          id: "paper-2",
          paperCode: "W1",
          gramWeightGsm: 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: "paper-3",
          paperCode: "P2",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      }),
    ],
    ...overrides,
  };
}

function createWeakCandidate(id: string): MatchingCandidate {
  return createCandidate({
    id,
    layers: [
      createLayer({
        role: "outer_liner",
        paper: {
          id: `${id}-paper-1`,
          paperCode: `${id}-P1`,
          gramWeightGsm: 100,
          priceYuanPerTon: 3000,
          burstIndex: 0.5,
          ringCrushIndex: 1,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: "B",
        paper: {
          id: `${id}-paper-2`,
          paperCode: `${id}-W1`,
          gramWeightGsm: 100,
          priceYuanPerTon: 2800,
          burstIndex: 0.5,
          ringCrushIndex: 1,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: `${id}-paper-3`,
          paperCode: `${id}-P2`,
          gramWeightGsm: 100,
          priceYuanPerTon: 3000,
          burstIndex: 0.5,
          ringCrushIndex: 1,
        },
      }),
    ],
  });
}

function createReason(type: RejectionReason["type"], code: string): RejectionReason {
  return {
    type,
    code,
    message: code,
  };
}

describe("evaluateMatchingCandidates", () => {
  it("splits real candidates into eligible and rejected lists", () => {
    const eligibleCandidate = createCandidate({ id: "eligible" });
    const rejectedCandidate = createWeakCandidate("weak");

    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [eligibleCandidate, rejectedCandidate],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.eligibleCandidates).toHaveLength(1);
    expect(result.eligibleCandidates[0]?.candidate.id).toBe("eligible");
    expect(result.rejectedCandidates).toHaveLength(1);
    expect(result.rejectedCandidates[0]?.candidate.id).toBe("weak");
  });

  it("keeps device and strength failures out of eligible candidates", () => {
    const eligibleCandidate = createCandidate({ id: "eligible" });
    const deviceRejectedCandidate = createCandidate({ id: "device-rejected" });
    const strengthRejectedCandidate = createCandidate({ id: "strength-rejected" });
    const fakeEvaluations: Record<string, CandidateEvaluation> = {
      eligible: {
        status: "eligible",
        candidate: eligibleCandidate,
        area: {} as BoardAreaResult,
        device: {} as DeviceLimitResult,
        strength: {} as StrengthResult,
        cost: {} as CostResult,
      },
      "device-rejected": {
        status: "rejected",
        candidate: deviceRejectedCandidate,
        reasons: [createReason("NOT_MANUFACTURABLE", "BOARD_WIDTH_TOO_LARGE")],
      },
      "strength-rejected": {
        status: "rejected",
        candidate: strengthRejectedCandidate,
        reasons: [createReason("STRENGTH_UNQUALIFIED", "ECT_TOO_LOW")],
      },
    };

    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [eligibleCandidate, deviceRejectedCandidate, strengthRejectedCandidate],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      evaluateCandidateFn: ({ candidate }) => fakeEvaluations[candidate.id]!,
    });

    expect(result.eligibleCandidates.map((evaluation) => evaluation.candidate.id)).toEqual([
      "eligible",
    ]);
    expect(result.rejectedCandidates.map((evaluation) => evaluation.candidate.id)).toEqual([
      "device-rejected",
      "strength-rejected",
    ]);
  });

  it("summarizes rejected reasons by reason row count", () => {
    const firstCandidate = createCandidate({ id: "first" });
    const secondCandidate = createCandidate({ id: "second" });

    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [firstCandidate, secondCandidate],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      evaluateCandidateFn: ({ candidate }) => ({
        status: "rejected",
        candidate,
        reasons:
          candidate.id === "first"
            ? [
                createReason("NOT_MANUFACTURABLE", "BOARD_WIDTH_TOO_LARGE"),
                createReason("NOT_MANUFACTURABLE", "BOX_HEIGHT_TOO_LARGE"),
              ]
            : [createReason("STRENGTH_UNQUALIFIED", "ECT_TOO_LOW")],
      }),
    });

    expect(result.rejectedSummary).toEqual([
      { type: "NOT_MANUFACTURABLE", label: "设备不可生产", count: 2 },
      { type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 },
    ]);
  });

  it("returns summary when every candidate is rejected", () => {
    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [createWeakCandidate("weak-1"), createWeakCandidate("weak-2")],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.eligibleCandidates).toEqual([]);
    expect(result.rejectedCandidates).toHaveLength(2);
    expect(result.rejectedSummary.length).toBeGreaterThan(0);
  });

  it("returns an empty summary when no candidates are rejected", () => {
    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [createCandidate({ id: "eligible-1" }), createCandidate({ id: "eligible-2" })],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.rejectedCandidates).toEqual([]);
    expect(result.rejectedSummary).toEqual([]);
  });

  it("keeps candidate fields needed by expandable details", () => {
    const candidate = createWeakCandidate("weak");

    const result = evaluateMatchingCandidates({
      boxSpec: createBoxSpec(),
      candidates: [candidate],
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.rejectedCandidates[0]?.candidate).toMatchObject({
      id: "weak",
      layerCount: 3,
      fluteType: "B",
    });
    expect(result.rejectedCandidates[0]?.candidate.layers[0]?.paper.paperCode).toBe("weak-P1");
  });
});
