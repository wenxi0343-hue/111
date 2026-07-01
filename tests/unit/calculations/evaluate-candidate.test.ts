import { describe, expect, it, vi } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { evaluateCandidate } from "@/modules/calculations/evaluate-candidate";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  CandidateLayer,
  MatchingCandidate,
  RejectionReasonType,
} from "@/modules/calculations/types";

function createBoxSpec(overrides: Partial<NormalizedBoxSpec> = {}): NormalizedBoxSpec {
  return {
    lengthMm: 500,
    widthMm: 300,
    heightMm: 250,
    structureType: "0201",
    formingMethod: "glue",
    productType: "food",
    productWeightKg: 10,
    arrangement: "single_row",
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

function getReasonTypes(result: ReturnType<typeof evaluateCandidate>): RejectionReasonType[] {
  return result.status === "rejected" ? result.reasons.map((reason) => reason.type) : [];
}

describe("evaluateCandidate", () => {
  it("rejects candidates with missing paper data and does not continue calculations", () => {
    const candidate = createCandidate({
      layers: [
        createLayer({
          role: "outer_liner",
          paper: {
            id: "paper-1",
            paperCode: "P1",
            gramWeightGsm: 200,
            priceYuanPerTon: undefined,
            burstIndex: 10,
            ringCrushIndex: 20,
          },
        }),
      ],
    });

    const result = evaluateCandidate({
      boxSpec: createBoxSpec(),
      candidate,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("rejected");
    expect(getReasonTypes(result)).toEqual(["DATA_MISSING"]);
    expect(result).not.toHaveProperty("area");
    expect(result).not.toHaveProperty("strength");
    expect(result).not.toHaveProperty("cost");
  });

  it("rejects candidates with missing calculation parameters before later calculations", () => {
    const parameters = {
      ...DEFAULT_CALCULATION_PARAMETERS,
      corrugationTakeUpFactors: {
        A: 1.49,
        C: 1.431,
        E: 1.329,
      },
    };

    const result = evaluateCandidate({
      boxSpec: createBoxSpec(),
      candidate: createCandidate(),
      parameters: parameters as typeof DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("rejected");
    expect(getReasonTypes(result)).toEqual(["PARAMETER_ERROR"]);
    expect(result).not.toHaveProperty("area");
    expect(result).not.toHaveProperty("strength");
    expect(result).not.toHaveProperty("cost");
  });

  it("short-circuits strength and cost when the candidate is not manufacturable", () => {
    const calculateStrength = vi.fn();
    const calculateCost = vi.fn();

    const result = evaluateCandidate({
      boxSpec: createBoxSpec({ lengthMm: 2000, widthMm: 900, heightMm: 900 }),
      candidate: createCandidate(),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      calculators: {
        calculateStrength,
        calculateCost,
      },
    });

    expect(result.status).toBe("rejected");
    expect(getReasonTypes(result)).toContain("NOT_MANUFACTURABLE");
    expect(result).toHaveProperty("area");
    expect(result).toHaveProperty("device");
    expect(result).not.toHaveProperty("strength");
    expect(result).not.toHaveProperty("cost");
    expect(calculateStrength).not.toHaveBeenCalled();
    expect(calculateCost).not.toHaveBeenCalled();
  });

  it("keeps all device rejection reasons", () => {
    const result = evaluateCandidate({
      boxSpec: createBoxSpec({ lengthMm: 2000, widthMm: 900, heightMm: 900 }),
      candidate: createCandidate(),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reasons.length : 0).toBeGreaterThan(1);
  });

  it("keeps area, device, strength, and cost when strength is unqualified", () => {
    const weakCandidate = createCandidate({
      layers: [
        createLayer({
          role: "outer_liner",
          paper: {
            id: "paper-1",
            paperCode: "P1",
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
            id: "paper-2",
            paperCode: "W1",
            gramWeightGsm: 100,
            priceYuanPerTon: 2800,
            burstIndex: 0.5,
            ringCrushIndex: 1,
          },
        }),
        createLayer({
          role: "inner_liner",
          paper: {
            id: "paper-3",
            paperCode: "P2",
            gramWeightGsm: 100,
            priceYuanPerTon: 3000,
            burstIndex: 0.5,
            ringCrushIndex: 1,
          },
        }),
      ],
    });

    const result = evaluateCandidate({
      boxSpec: createBoxSpec(),
      candidate: weakCandidate,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("rejected");
    expect(getReasonTypes(result)).toEqual(
      expect.arrayContaining(["STRENGTH_UNQUALIFIED"]),
    );
    expect(result).toHaveProperty("area");
    expect(result).toHaveProperty("device");
    expect(result).toHaveProperty("strength");
    expect(result).toHaveProperty("cost");
  });

  it("keeps every unqualified strength reason", () => {
    const result = evaluateCandidate({
      boxSpec: createBoxSpec(),
      candidate: createCandidate({
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 100,
              priceYuanPerTon: 3000,
              burstIndex: 0.5,
              ringCrushIndex: 1,
            },
          }),
        ],
      }),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reasons : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ECT_TOO_LOW" }),
        expect.objectContaining({ code: "BURST_TOO_LOW" }),
      ]),
    );
  });

  it("marks complete, manufacturable, qualified candidates as eligible", () => {
    const result = evaluateCandidate({
      boxSpec: createBoxSpec(),
      candidate: createCandidate(),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    expect(result.status).toBe("eligible");
    expect(result).toHaveProperty("area");
    expect(result).toHaveProperty("device");
    expect(result).toHaveProperty("strength");
    expect(result).toHaveProperty("cost");
  });

  it("does not create stacking-specific rejection reasons", () => {
    const result = evaluateCandidate({
      boxSpec: createBoxSpec({
        stackingRequirement: {
          status: "required",
          stackingLayers: 5,
          displayText: "stacking required",
        },
      }),
      candidate: createCandidate(),
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    const messages = result.status === "rejected"
      ? result.reasons.map((reason) => reason.message).join("")
      : "";

    expect(messages).not.toContain("堆码");
  });
});
