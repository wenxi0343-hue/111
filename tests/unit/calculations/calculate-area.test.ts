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

describe("calculateBoardArea", () => {
  it("uses the three-layer rule for five-layer BE flute", () => {
    const result = calculateBoardArea({ boxSpec: createBoxSpec(), layerCount: 5, fluteType: "BE" });
    expect(result).toMatchObject({
      tongueMm: 35,
      flapMm: 155,
      boardLengthMm: 1657,
      boardWidthMm: 566,
    });
  });

  it("uses the confirmed seven-layer one-piece allowances", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec(),
      layerCount: 7,
      fluteType: "BAC",
    });
    expect(result).toMatchObject({ boardLengthMm: 1677, boardWidthMm: 575, formingPieces: 1 });
    expect(result.areaSquareMeters).toBeCloseTo(0.964275, 6);
  });
  it("calculates the three-layer B flute inner size, tongue, flap, board size, and area", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec(),
      layerCount: 3,
      fluteType: "B",
    });

    expect(result).toMatchObject({
      innerLengthMm: 500,
      innerWidthMm: 300,
      innerHeightMm: 250,
      tongueMm: 35,
      flapMm: 154,
      boardWidthMm: 564,
      boardLengthMm: 1657,
      formingPieces: 1,
    });
    expect(result.areaSquareMeters).toBeCloseTo(0.9345, 4);
  });

  it("uses the wider three-layer flap rule for C flute", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec(),
      layerCount: 3,
      fluteType: "C",
    });

    expect(result.flapMm).toBe(155);
    expect(result.boardWidthMm).toBe(566);
  });

  it("calculates five-layer staple box inner size, tongue, and flap", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({ formingMethod: "staple" }),
      layerCount: 5,
      fluteType: "BC",
    });

    expect(result).toMatchObject({
      innerLengthMm: 500,
      innerWidthMm: 300,
      innerHeightMm: 250,
      tongueMm: 45,
      flapMm: 156,
      boardLengthMm: 1669,
      boardWidthMm: 569,
      formingPieces: 1,
    });
    expect(result.areaSquareMeters).toBeCloseTo(0.9497, 4);
  });

  it("calculates the confirmed five-layer BC glue area from inner dimensions", () => {
    const result = calculateBoardArea({
      boxSpec: createBoxSpec({
        lengthMm: 425,
        widthMm: 335,
        heightMm: 155,
      }),
      layerCount: 5,
      fluteType: "BC",
    });

    expect(result).toMatchObject({
      innerLengthMm: 425,
      innerWidthMm: 335,
      innerHeightMm: 155,
      tongueMm: 40,
      flapMm: 173.5,
      boardLengthMm: 1584,
      boardWidthMm: 509,
      formingPieces: 1,
    });
    expect(result.areaSquareMeters).toBeCloseTo(0.8063, 4);
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
      innerLengthMm: 700,
      innerWidthMm: 400,
      innerHeightMm: 300,
      tongueMm: 45,
      flapMm: 208,
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
