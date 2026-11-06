import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { calculateStrength } from "@/modules/calculations/calculate-strength";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type {
  BoardAreaResult,
  CandidateLayer,
  MatchingCandidate,
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

function createArea(overrides: Partial<BoardAreaResult> = {}): BoardAreaResult {
  return {
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
    ...overrides,
  };
}

function createLayer(overrides: Partial<CandidateLayer>): CandidateLayer {
  return {
    role: "outer_liner",
    paper: {
      id: "paper-1",
      paperCode: "P1",
      gramWeightGsm: 150,
      burstIndex: 2,
      ringCrushIndex: 8,
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
          gramWeightGsm: 120,
          burstIndex: 9,
          ringCrushIndex: 6,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: "paper-3",
          paperCode: "P2",
          gramWeightGsm: 150,
          burstIndex: 1,
          ringCrushIndex: 8,
        },
      }),
    ],
    ...overrides,
  };
}

function calculate(overrides: {
  boxSpec?: Partial<NormalizedBoxSpec>;
  candidate?: Partial<MatchingCandidate>;
  area?: Partial<BoardAreaResult>;
} = {}) {
  return calculateStrength({
    boxSpec: createBoxSpec(overrides.boxSpec),
    candidate: createCandidate(overrides.candidate),
    area: createArea(overrides.area),
    parameters: DEFAULT_CALCULATION_PARAMETERS,
  });
}

describe("calculateStrength", () => {
  it("calculates burst strength from liner and medium layers but excludes corrugating layers", () => {
    const result = calculate();

    expect(result.burstStrength).toBe(428);
  });

  it("calculates flat paper ring crush strength from ring crush index and gram weight", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 150,
              burstIndex: 1,
              ringCrushIndex: 8,
            },
          }),
        ],
      },
    });

    expect(result.edgeCrushNPerM).toBe(1200);
    expect(result.edgeCrushKnPerM).toBe(1.2);
  });

  it("calculates corrugating ring crush strength with the flute take-up factor", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "corrugating",
            flute: "A",
            paper: {
              id: "paper-1",
              paperCode: "A-W",
              gramWeightGsm: 120,
              burstIndex: 1,
              ringCrushIndex: 6,
            },
          }),
        ],
      },
    });

    expect(result.edgeCrushNPerM).toBe(1073);
  });

  it("calculates BCT from edge crush, board thickness, and inner perimeter", () => {
    const result = calculate();
    const expectedBct = Math.round(
      3358 * 5.874 * Math.sqrt((2.5 * ((492 + 292) * 2)) / 1_000_000),
    );

    expect(result.edgeCrushNPerM).toBe(3358);
    expect(result.bctN).toBe(expectedBct);
  });

  it("reports BCT as unqualified when it is below the layer threshold", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "inner_liner",
            paper: {
              id: "paper-2",
              paperCode: "P2",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "corrugating",
            flute: "B",
            paper: {
              id: "paper-3",
              paperCode: "W1",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 15.7894736842,
            },
          }),
        ],
      },
      area: {
        innerLengthMm: 30,
        innerWidthMm: 24.8959353466,
      },
    });

    expect(result.edgeCrushKnPerM).toBeCloseTo(4.1, 4);
    expect(result.bctN).toBe(399);
    expect(result.isQualified).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("空箱抗压不足") }),
      ]),
    );
  });

  it("reports ECT as unqualified when it is below the layer threshold", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "inner_liner",
            paper: {
              id: "paper-2",
              paperCode: "P2",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "corrugating",
            flute: "B",
            paper: {
              id: "paper-3",
              paperCode: "W1",
              gramWeightGsm: 100,
              burstIndex: 10,
              ringCrushIndex: 14.2857142857,
            },
          }),
        ],
      },
      area: {
        innerLengthMm: 31,
        innerWidthMm: 30.39,
      },
    });

    expect(result.bctN).toBe(401);
    expect(result.edgeCrushKnPerM).toBeCloseTo(3.9, 4);
    expect(result.isQualified).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("边压不足") }),
      ]),
    );
  });

  it("passes when BCT and ECT meet the three-layer thresholds", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 150,
              burstIndex: 2,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "inner_liner",
            paper: {
              id: "paper-2",
              paperCode: "P2",
              gramWeightGsm: 150,
              burstIndex: 2,
              ringCrushIndex: 10,
            },
          }),
          createLayer({
            role: "corrugating",
            flute: "B",
            paper: {
              id: "paper-3",
              paperCode: "W1",
              gramWeightGsm: 120,
              burstIndex: 2,
              ringCrushIndex: 7,
            },
          }),
        ],
      },
    });

    expect(result.bctN).toBeGreaterThanOrEqual(400);
    expect(result.edgeCrushKnPerM).toBeGreaterThanOrEqual(4);
    expect(result.isQualified).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("uses five-layer and seven-layer thresholds", () => {
    const fiveLayerResult = calculate({
      candidate: { layerCount: 5, fluteType: "BC" },
    });
    const sevenLayerResult = calculate({
      candidate: { layerCount: 7, fluteType: "BAC" },
    });

    expect(fiveLayerResult.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("边压不足") }),
      ]),
    );
    expect(sevenLayerResult.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("边压不足") }),
      ]),
    );
  });

  it("returns all unqualified strength reasons", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 100,
              burstIndex: 0.5,
              ringCrushIndex: 1,
            },
          }),
        ],
      },
    });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("空箱抗压不足") }),
        expect.objectContaining({ message: expect.stringContaining("边压不足") }),
        expect.objectContaining({ message: expect.stringContaining("耐破不足") }),
      ]),
    );
  });

  it("raises the qualification requirement for heavier stacked orders in the same layer count", () => {
    const candidate = {
      layers: [
        createLayer({
          role: "outer_liner",
          paper: {
            id: "paper-1",
            paperCode: "P1",
            gramWeightGsm: 150,
            burstIndex: 2,
            ringCrushIndex: 10,
          },
        }),
        createLayer({
          role: "inner_liner",
          paper: {
            id: "paper-2",
            paperCode: "P2",
            gramWeightGsm: 150,
            burstIndex: 2,
            ringCrushIndex: 10,
          },
        }),
        createLayer({
          role: "corrugating",
          flute: "B",
          paper: {
            id: "paper-3",
            paperCode: "W1",
            gramWeightGsm: 120,
            burstIndex: 2,
            ringCrushIndex: 7,
          },
        }),
      ],
    };
    const lightOrderResult = calculate({
      boxSpec: {
        lengthMm: 260,
        widthMm: 180,
        heightMm: 120,
        productWeightKg: 3,
      },
      candidate,
    });
    const stackedHeavyOrderResult = calculate({
      boxSpec: {
        lengthMm: 600,
        widthMm: 400,
        heightMm: 350,
        productWeightKg: 19,
        stackingRequirement: {
          status: "required",
          stackingLayers: 5,
          displayText: "stacking 5 layers",
        },
      },
      candidate,
    });

    expect(lightOrderResult.isQualified).toBe(true);
    expect(stackedHeavyOrderResult.isQualified).toBe(false);
    expect(stackedHeavyOrderResult.reasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "STRENGTH_UNQUALIFIED" })]),
    );
  });

  it("does not create stacking-specific formulas or stacking reasons", () => {
    const result = calculate({
      boxSpec: {
        stackingRequirement: {
          status: "required",
          stackingLayers: 5,
          displayText: "已填写堆码层数 5 层，承重纳入本次判断",
        },
      },
    });

    expect(result.reasons.map((reason) => reason.message).join("")).not.toContain("堆码");
  });
});
