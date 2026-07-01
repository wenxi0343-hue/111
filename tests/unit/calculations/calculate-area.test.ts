import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { calculateBoardArea } from "@/modules/calculations/calculate-area";

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
    productionQuantity: 1000,
    stackingRequirement: {
      status: "not_required",
      displayText: "未填写堆码层数，承重未校核",
    },
    ...overrides,
  };
}

describe("calculateBoardArea", () => {
  it("calculates the three-layer B flute inner size, tongue, flap, board size, and area", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec(),
      layerCount: 3,
      fluteType: "B",
    });

    expect(result).toMatchObject({
      innerLengthMm: 492,
      innerWidthMm: 292,
      innerHeightMm: 242,
      tongueMm: 35,
      flapMm: 150,
      boardWidthMm: 548,
      boardLengthMm: 1625,
      formingPieces: 1,
    });
    expect(result.areaSquareMeters).toBeCloseTo(0.8905, 4);
  });

  it("uses the wider three-layer flap rule for C flute", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec(),
      layerCount: 3,
      fluteType: "C",
    });

    expect(result.flapMm).toBe(151);
    expect(result.boardWidthMm).toBe(550);
  });

  it("calculates five-layer staple box inner size, tongue, and flap", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({ formingMethod: "staple" }),
      layerCount: 5,
      fluteType: "BC",
    });

    expect(result).toMatchObject({
      innerLengthMm: 490,
      innerWidthMm: 290,
      innerHeightMm: 240,
      tongueMm: 45,
      flapMm: 151,
      formingPieces: 1,
    });
  });

  it("calculates seven-layer box inner size, fixed tongue, and flap", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({
        lengthMm: 700,
        widthMm: 400,
        heightMm: 300,
      }),
      layerCount: 7,
      fluteType: "BAC",
    });

    expect(result).toMatchObject({
      innerLengthMm: 686,
      innerWidthMm: 386,
      innerHeightMm: 286,
      tongueMm: 45,
      flapMm: 201,
      formingPieces: 1,
    });
  });

  it("switches seven-layer boxes to two-piece forming when one-piece board width is too wide", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({
        lengthMm: 1600,
        widthMm: 1300,
        heightMm: 900,
      }),
      layerCount: 7,
      fluteType: "BAC",
    });

    expect(result.formingPieces).toBe(2);
    expect(result.boardWidthMm).toBeLessThanOrEqual(1710);
  });

  it("does not switch three-layer boxes to two-piece forming when one-piece board width is too wide", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({
        lengthMm: 1600,
        widthMm: 1300,
        heightMm: 900,
      }),
      layerCount: 3,
      fluteType: "B",
    });

    expect(result.formingPieces).toBe(1);
    expect(result.boardWidthMm).toBeGreaterThan(1710);
  });
});
