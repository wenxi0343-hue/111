import { describe, expect, it } from "vitest";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { MatchingCandidate } from "@/modules/calculations/types";
import {
  compareCompanyPaperPrinciplePreference,
  getCompanyPaperPrincipleViolations,
} from "@/modules/recommendation/company-paper-principles";

describe("company paper principles", () => {
  it("rejects candidates whose corrugating paper is heavier than liner papers", () => {
    const candidate = createCandidate({
      outerGsm: 200,
      corrugatingGsm: 220,
      innerGsm: 200,
    });

    expect(getCompanyPaperPrincipleViolations({ boxSpec: createBoxSpec(), candidate })).toEqual([
      expect.objectContaining({ code: "CORRUGATING_NOT_LOWER_THAN_LINER" }),
    ]);
  });

  it("rejects candidates whose corrugating paper is not 20%-40% lower than liner papers", () => {
    const candidate = createCandidate({
      outerGsm: 140,
      corrugatingGsm: 120,
      innerGsm: 140,
    });

    expect(getCompanyPaperPrincipleViolations({ boxSpec: createBoxSpec(), candidate })).toEqual([
      expect.objectContaining({ code: "CORRUGATING_RATIO_OUT_OF_RANGE" }),
    ]);
  });

  it("rejects candidates whose inner liner is heavier than the outer liner", () => {
    const candidate = createCandidate({
      outerGsm: 190,
      corrugatingGsm: 140,
      innerGsm: 200,
    });

    expect(getCompanyPaperPrincipleViolations({ boxSpec: createBoxSpec(), candidate })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "INNER_LINER_HEAVIER_THAN_OUTER" })]),
    );
  });

  it("accepts candidates whose outer liner is within 20g above the inner liner", () => {
    const candidate = createCandidate({
      outerGsm: 200,
      corrugatingGsm: 140,
      innerGsm: 180,
    });

    expect(getCompanyPaperPrincipleViolations({ boxSpec: createBoxSpec(), candidate })).toEqual([]);
  });

  it("rejects candidates whose outer and inner liner weight gap is above 20g", () => {
    const candidate = createCandidate({
      outerGsm: 230,
      corrugatingGsm: 160,
      innerGsm: 200,
    });

    expect(getCompanyPaperPrincipleViolations({ boxSpec: createBoxSpec(), candidate })).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "LINER_WEIGHT_GAP_TOO_LARGE" })]),
    );
  });

  it("rejects die-cutting three-layer candidates with liner papers below 190g", () => {
    const candidate = createCandidate({
      outerGsm: 180,
      corrugatingGsm: 120,
      innerGsm: 180,
    });

    expect(
      getCompanyPaperPrincipleViolations({
        boxSpec: createBoxSpec({
          specialRequirements: { dieCutting: true, punctureStrengthRequired: false },
        }),
        candidate,
      }),
    ).toEqual([expect.objectContaining({ code: "DIE_CUTTING_THREE_LAYER_LINER_TOO_LOW" })]);
  });

  it("prefers corrugating paper that is 20%-40% lower than liner papers", () => {
    const preferred = createCandidate({
      id: "preferred",
      outerGsm: 200,
      corrugatingGsm: 160,
      innerGsm: 200,
    });
    const weakRatio = createCandidate({
      id: "weak-ratio",
      outerGsm: 200,
      corrugatingGsm: 100,
      innerGsm: 200,
    });

    expect(
      compareCompanyPaperPrinciplePreference(preferred, weakRatio, createBoxSpec()),
    ).toBeLessThan(0);
  });

  it("prefers practical liner weights over overbuilt balanced liners", () => {
    const practical = createCandidate({
      id: "practical",
      outerGsm: 200,
      corrugatingGsm: 140,
      innerGsm: 180,
    });
    const overbuilt = createCandidate({
      id: "overbuilt",
      outerGsm: 360,
      corrugatingGsm: 220,
      innerGsm: 360,
    });

    expect(
      compareCompanyPaperPrinciplePreference(practical, overbuilt, createBoxSpec()),
    ).toBeLessThan(0);
  });

  it("prefers lower medium paper when puncture strength is not required", () => {
    const lowerMedium = createFiveLayerCandidate({ id: "lower-medium", mediumGsm: 120 });
    const higherMedium = createFiveLayerCandidate({ id: "higher-medium", mediumGsm: 180 });

    expect(
      compareCompanyPaperPrinciplePreference(lowerMedium, higherMedium, createBoxSpec()),
    ).toBeLessThan(0);
  });

  it("does not penalize higher medium paper when puncture strength is required", () => {
    const lowerMedium = createFiveLayerCandidate({ id: "lower-medium", mediumGsm: 120 });
    const higherMedium = createFiveLayerCandidate({ id: "higher-medium", mediumGsm: 180 });

    expect(
      compareCompanyPaperPrinciplePreference(
        lowerMedium,
        higherMedium,
        createBoxSpec({
          specialRequirements: {
            dieCutting: false,
            punctureStrengthRequired: true,
          },
        }),
      ),
    ).toBe(0);
  });
});

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

function createCandidate(input: {
  id?: string;
  outerGsm: number;
  corrugatingGsm: number;
  innerGsm: number;
}): MatchingCandidate {
  return {
    id: input.id ?? "candidate",
    layerCount: 3,
    fluteType: "B",
    layers: [
      { role: "outer_liner", paper: createPaper("outer", input.outerGsm) },
      { role: "corrugating", flute: "B", paper: createPaper("corrugating", input.corrugatingGsm) },
      { role: "inner_liner", paper: createPaper("inner", input.innerGsm) },
    ],
  };
}

function createFiveLayerCandidate(input: { id: string; mediumGsm: number }): MatchingCandidate {
  return {
    id: input.id,
    layerCount: 5,
    fluteType: "BC",
    layers: [
      { role: "outer_liner", paper: createPaper(`${input.id}-outer`, 220) },
      { role: "corrugating", flute: "B", paper: createPaper(`${input.id}-corr-b`, 160) },
      { role: "medium", paper: createPaper(`${input.id}-medium`, input.mediumGsm) },
      { role: "corrugating", flute: "C", paper: createPaper(`${input.id}-corr-c`, 160) },
      { role: "inner_liner", paper: createPaper(`${input.id}-inner`, 220) },
    ],
  };
}

function createPaper(id: string, gramWeightGsm: number) {
  return {
    id,
    paperCode: id,
    gramWeightGsm,
    priceYuanPerTon: 3000,
    burstIndex: 10,
    ringCrushIndex: 20,
  };
}
