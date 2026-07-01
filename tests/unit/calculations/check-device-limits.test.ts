import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import { checkDeviceLimits } from "@/modules/calculations/check-device-limits";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import type { BoardAreaResult } from "@/modules/calculations/types";

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

function createBoard(overrides: Partial<BoardAreaResult> = {}): BoardAreaResult {
  return {
    innerLengthMm: 492,
    innerWidthMm: 292,
    innerHeightMm: 242,
    boardLengthMm: 1000,
    boardWidthMm: 1000,
    feedLengthMm: 1000,
    feedWidthMm: 1000,
    printLengthMm: 1000,
    printWidthMm: 1000,
    slotIntervalsMm: {
      firstPanel: 492,
      firstSlot: 292,
      secondPanel: 492,
      secondSlot: 292,
    },
    areaSquareMeters: 1,
    formingPieces: 1,
    flapMm: 150,
    tongueMm: 35,
    ...overrides,
  };
}

function check(overrides: Partial<BoardAreaResult>, boxSpec?: Partial<NormalizedBoxSpec>) {
  return checkDeviceLimits({
    board: createBoard(overrides),
    boxSpec: createBoxSpec(boxSpec),
    parameters: DEFAULT_CALCULATION_PARAMETERS.deviceLimits,
  });
}

describe("checkDeviceLimits", () => {
  it("passes when all device limits are satisfied, including maximum board size boundary", () => {
    const result = check({
      boardLengthMm: 1800,
      boardWidthMm: 1710,
      feedLengthMm: 1800,
      feedWidthMm: 1580,
      printLengthMm: 1800,
      printWidthMm: 1200,
    });

    expect(result).toEqual({
      isManufacturable: true,
      reasons: [],
    });
  });

  it("rejects board dimensions above maximum limits", () => {
    expect(check({ boardLengthMm: 1801 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("纸板长超过 1800mm") }),
      ]),
    );
    expect(check({ boardWidthMm: 1711 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("纸板宽超过 1710mm") }),
      ]),
    );
  });

  it("rejects board dimensions below minimum limits", () => {
    expect(check({ boardLengthMm: 499 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("纸板长小于 500mm") }),
      ]),
    );
    expect(check({ boardWidthMm: 359 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("纸板宽小于 360mm") }),
      ]),
    );
  });

  it("rejects printer slotter maximum feed size without rotating feed direction", () => {
    expect(check({ feedLengthMm: 2401, feedWidthMm: 1000 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("进纸总长超过 2400mm") }),
      ]),
    );
    expect(check({ feedLengthMm: 1000, feedWidthMm: 1581 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("进纸总宽超过 1580mm") }),
      ]),
    );
  });

  it("rejects printer slotter minimum feed size", () => {
    expect(check({ feedLengthMm: 599 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("进纸总长小于 600mm") }),
      ]),
    );
    expect(check({ feedWidthMm: 359 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("进纸总宽小于 360mm") }),
      ]),
    );
  });

  it("rejects print face above maximum limits", () => {
    expect(check({ printLengthMm: 2361, printWidthMm: 1000 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("印刷面长超过 2360mm") }),
      ]),
    );
    expect(check({ printLengthMm: 1000, printWidthMm: 1201 }).reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("印刷面宽超过 1200mm") }),
      ]),
    );
  });

  it("rejects slot intervals below minimum limits", () => {
    const result = check({
      slotIntervalsMm: {
        firstPanel: 229,
        firstSlot: 64,
        secondPanel: 229,
        secondSlot: 64,
      },
    });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("开槽间隔不满足") }),
      ]),
    );
  });

  it("rejects box height above maximum limit", () => {
    const result = check({}, { heightMm: 851 });

    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("箱高超过 850mm") }),
      ]),
    );
  });

  it("returns all identified device reasons for one candidate", () => {
    const result = check({ boardWidthMm: 1711 }, { heightMm: 851 });

    expect(result.isManufacturable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("纸板宽超过 1710mm") }),
        expect.objectContaining({ message: expect.stringContaining("箱高超过 850mm") }),
      ]),
    );
  });
});
