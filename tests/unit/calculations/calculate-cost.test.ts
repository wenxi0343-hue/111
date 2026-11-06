import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { calculateCost } from "@/modules/calculations/calculate-cost";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type { BoardAreaResult, CandidateLayer, MatchingCandidate } from "@/modules/calculations/types";

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
    productionQuantity: 100,
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
      priceYuanPerTon: 3000,
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
      createLayer({
        role: "outer_liner",
        paper: {
          id: "paper-1",
          paperCode: "P1",
          gramWeightGsm: 150,
          priceYuanPerTon: 3000,
          burstIndex: 2,
          ringCrushIndex: 8,
        },
      }),
      createLayer({
        role: "corrugating",
        flute: "B",
        paper: {
          id: "paper-2",
          paperCode: "W1",
          gramWeightGsm: 120,
          priceYuanPerTon: 2800,
          burstIndex: 1,
          ringCrushIndex: 6,
        },
      }),
      createLayer({
        role: "inner_liner",
        paper: {
          id: "paper-3",
          paperCode: "P2",
          gramWeightGsm: 150,
          priceYuanPerTon: 3000,
          burstIndex: 2,
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
  return calculateCost({
    boxSpec: createBoxSpec(overrides.boxSpec),
    candidate: createCandidate(overrides.candidate),
    area: createArea(overrides.area),
    parameters: DEFAULT_CALCULATION_PARAMETERS,
  });
}

describe("calculateCost", () => {
  it.each([
    [100, 0.8],
    [200, 0.81],
    [2000, 0.9],
    [7000, 0.95],
  ])("uses utilization rate %s -> %s", (productionQuantity, expectedRate) => {
    const result = calculate({ boxSpec: { productionQuantity } });

    expect(result.utilizationRate).toBe(expectedRate);
  });

  it("calculates flat paper layer unit price", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 150,
              priceYuanPerTon: 3000,
              burstIndex: 2,
              ringCrushIndex: 8,
            },
          }),
        ],
      },
    });

    expect(result.layerUnitPrices[0]).toMatchObject({
      role: "outer_liner",
      paperCode: "P1",
      unitPriceYuanPerSquareMeter: 0.45,
    });
  });

  it("calculates corrugating layer unit price with flute take-up factor", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "corrugating",
            flute: "B",
            paper: {
              id: "paper-1",
              paperCode: "B-W",
              gramWeightGsm: 120,
              priceYuanPerTon: 2800,
              burstIndex: 1,
              ringCrushIndex: 6,
            },
          }),
        ],
      },
    });

    expect(result.layerUnitPrices[0]?.unitPriceYuanPerSquareMeter).toBeCloseTo(
      (2800 * 120 * 1.33) / 1_000_000,
      4,
    );
  });

  it("calculates paper cost from layer unit prices, area, and utilization rate", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 400,
              priceYuanPerTon: 3000,
              burstIndex: 2,
              ringCrushIndex: 8,
            },
          }),
        ],
      },
      area: { areaSquareMeters: 0.8905 },
      boxSpec: { productionQuantity: 100 },
    });

    expect(result.paperCostYuan).toBeCloseTo((1.2 * 0.8905) / 0.8, 4);
  });

  it("calculates processing fee from layer factor, area, and utilization rate", () => {
    const result = calculate({
      area: { areaSquareMeters: 0.8905 },
      boxSpec: { productionQuantity: 100 },
      candidate: { layerCount: 3 },
    });

    expect(result.processingFeeYuan).toBeCloseTo((1.1 * 0.9 * 0.8905) / 0.8, 4);
  });

  it("returns default pad fee explicitly as zero", () => {
    const result = calculate();

    expect(result.padFeeYuan).toBe(0);
  });

  it("calculates tax and tax-included cost", () => {
    const result = calculate({
      candidate: {
        layers: [
          createLayer({
            role: "outer_liner",
            paper: {
              id: "paper-1",
              paperCode: "P1",
              gramWeightGsm: 400,
              priceYuanPerTon: 3000,
              burstIndex: 2,
              ringCrushIndex: 8,
            },
          }),
        ],
      },
      area: { areaSquareMeters: 0.8905 },
      boxSpec: { productionQuantity: 100 },
    });
    const paperCostYuan = (1.2 * 0.8905) / 0.8;
    const processingFeeYuan = (1.1 * 0.9 * 0.8905) / 0.8;
    const taxYuan = (0 + processingFeeYuan + paperCostYuan) * 1.05 * 0.015;

    expect(result.taxYuan).toBeCloseTo(taxYuan, 4);
    expect(result.taxIncludedCostYuan).toBeCloseTo(
      0 + processingFeeYuan + taxYuan + paperCostYuan,
      4,
    );
  });
});
