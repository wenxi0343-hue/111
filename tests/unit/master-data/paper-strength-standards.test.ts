import { describe, expect, it } from "vitest";

import { resolvePaperStrengthStandard } from "@/modules/master-data/paper-strength-standards";

describe("paper strength standards", () => {
  it("resolves linerboard burst and ring crush indexes by grade and grammage", () => {
    expect(
      resolvePaperStrengthStandard({
        paperKind: "linerboard",
        grade: "合格品",
        gramWeightGsm: 130,
      }).standard,
    ).toEqual({
      burstIndex: 2.4,
      ringCrushIndex: 9.8,
    });

    expect(
      resolvePaperStrengthStandard({
        paperKind: "linerboard",
        grade: "优等品",
        gramWeightGsm: 250,
      }).standard,
    ).toEqual({
      burstIndex: 3.7,
      ringCrushIndex: 15.5,
    });
  });

  it("resolves corrugating strength indexes by grade and grammage", () => {
    expect(
      resolvePaperStrengthStandard({
        paperKind: "corrugating",
        grade: "一等品",
        gramWeightGsm: 110,
      }).standard,
    ).toEqual({
      burstIndex: 0.65,
      ringCrushIndex: 8.4,
    });
  });

  it("reports a missing grade or an uncovered grammage range", () => {
    expect(
      resolvePaperStrengthStandard({
        paperKind: "corrugating",
        gramWeightGsm: 110,
      }).missingReason,
    ).toMatchObject({ field: "grade" });

    expect(
      resolvePaperStrengthStandard({
        paperKind: "corrugating",
        grade: "合格品",
        gramWeightGsm: 300,
      }).missingReason,
    ).toMatchObject({ field: "strengthStandard" });
  });
});
