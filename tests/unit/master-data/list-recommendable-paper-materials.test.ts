import { describe, expect, it } from "vitest";

import {
  listRecommendablePaperMaterialsFromRepository,
  type ListRecommendablePaperMaterialsRepository,
  type RecommendablePaperMaterial,
} from "@/modules/master-data/list-recommendable-paper-materials";

class InMemoryListRecommendablePaperMaterialsRepository
  implements ListRecommendablePaperMaterialsRepository
{
  constructor(private readonly materials: RecommendablePaperMaterial[]) {}

  async listRecommendablePaperMaterials() {
    return this.materials.filter(
      (material) =>
        material.isActive && material.completenessStatus === "complete",
    );
  }
}

function createMaterial(
  overrides: Partial<RecommendablePaperMaterial> = {},
): RecommendablePaperMaterial {
  return {
    id: "paper-1",
    paperCode: "r2",
    factoryId: "factory-1",
    factoryName: "Supplier A",
    name: "105g high strength corrugating",
    paperKind: "corrugating",
    grade: "A",
    gramWeightGsm: 105,
    usage: "base",
    applicableFlutes: ["B", "C"],
    priceYuanPerTon: 3300,
    burstIndex: 2.2,
    ringCrushIndex: 7.5,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

describe("list recommendable paper materials", () => {
  it("returns only active and complete paper materials", async () => {
    const repository = new InMemoryListRecommendablePaperMaterialsRepository([
      createMaterial({ id: "stopped", paperCode: "r1", isActive: false }),
      createMaterial({
        id: "incomplete",
        paperCode: "r2",
        completenessStatus: "incomplete",
        missingFields: ["priceYuanPerTon"],
      }),
      createMaterial({ id: "recommendable", paperCode: "r3" }),
    ]);

    const result = await listRecommendablePaperMaterialsFromRepository({
      repository,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "recommendable",
        paperCode: "r3",
        isActive: true,
        completenessStatus: "complete",
      }),
    ]);
  });
});
