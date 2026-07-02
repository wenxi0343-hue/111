import { describe, expect, it } from "vitest";

import type { MatchingCandidate } from "@/modules/calculations/types";
import type { RecommendablePaperMaterial } from "@/modules/master-data/list-recommendable-paper-materials";
import { buildAdjustedCandidate } from "@/modules/scheme-adjustment/build-adjusted-candidate";

function createBaseCandidate(): MatchingCandidate {
  return {
    id: "base",
    layerCount: 3,
    fluteType: "B",
    layers: [
      {
        role: "outer_liner",
        paper: {
          id: "paper-a",
          paperCode: "A",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "corrugating",
        flute: "B",
        paper: {
          id: "paper-c",
          paperCode: "C",
          gramWeightGsm: 160,
          priceYuanPerTon: 2800,
          burstIndex: 8,
          ringCrushIndex: 18,
        },
      },
      {
        role: "inner_liner",
        paper: {
          id: "paper-d",
          paperCode: "D",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
    ],
  };
}

function createMaterial(
  id: string,
  overrides: Partial<RecommendablePaperMaterial> = {},
): RecommendablePaperMaterial {
  return {
    id,
    paperCode: id.toUpperCase(),
    factoryId: `${id}-factory`,
    factoryName: `${id} 纸厂`,
    name: `${id} 原纸`,
    paperKind: "linerboard",
    gramWeightGsm: 230,
    applicableFlutes: [],
    priceYuanPerTon: 3600,
    burstIndex: 12,
    ringCrushIndex: 24,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

describe("buildAdjustedCandidate", () => {
  it("applies adjusted layer count and flute type", () => {
    const result = buildAdjustedCandidate({
      baseCandidate: createBaseCandidate(),
      adjustments: {
        layerCount: 5,
        fluteType: "BC",
      },
      paperMaterials: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("adjusted candidate should succeed");
    }

    expect(result.data.layerCount).toBe(5);
    expect(result.data.fluteType).toBe("BC");
    expect(result.data.id).toBe("adjusted:5:BC:paper-a-paper-c-paper-d");
  });

  it("uses current paper material data when replacing the outer liner", () => {
    const result = buildAdjustedCandidate({
      baseCandidate: createBaseCandidate(),
      adjustments: {
        layers: [
          { role: "outer_liner", paperMaterialId: "paper-b" },
          { role: "corrugating", flute: "B", paperMaterialId: "paper-c" },
          { role: "inner_liner", paperMaterialId: "paper-d" },
        ],
      },
      paperMaterials: [
        createMaterial("paper-b", {
          paperCode: "B",
          factoryName: "二号纸厂",
          gramWeightGsm: 250,
          priceYuanPerTon: 4100,
          burstIndex: 14,
          ringCrushIndex: 28,
        }),
        createMaterial("paper-c", { paperKind: "corrugating", paperCode: "C" }),
        createMaterial("paper-d", { paperCode: "D" }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("adjusted candidate should succeed");
    }

    expect(result.data.layers[0]?.paper).toMatchObject({
      id: "paper-b",
      paperCode: "B",
      factoryName: "二号纸厂",
      gramWeightGsm: 250,
      priceYuanPerTon: 4100,
      burstIndex: 14,
      ringCrushIndex: 28,
    });
  });

  it("returns DATA_NOT_FOUND when an adjusted paper does not exist", () => {
    const result = buildAdjustedCandidate({
      baseCandidate: createBaseCandidate(),
      adjustments: {
        layers: [{ role: "outer_liner", paperMaterialId: "missing-paper" }],
      },
      paperMaterials: [],
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATA_NOT_FOUND",
        message: "调整后的原纸不存在或已停用",
      },
    });
  });
});
