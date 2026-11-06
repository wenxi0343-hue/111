import { describe, expect, it, vi } from "vitest";

import {
  mapSourcePaperMaterials,
  MatchingSourcePaperMaterialRepository,
  MatchingSourceReadinessRepository,
} from "@/modules/master-data/matching-source";
import {
  aggregateInStockRolls,
  inferWarehouseQualityGrade,
  WarehouseDatabaseMatchingSourceDataRepository,
  type WarehousePaperRollRecord,
} from "@/modules/master-data/warehouse-database-matching-source";
import { checkMatchingReadinessFromRepository } from "@/server/actions/matching-readiness";

describe("warehouse grade rules", () => {
  it.each([
    ["进口牛卡纸 H级", "优等品"],
    ["金太阳 AA级牛卡纸", "优等品"],
    ["国产 H级箱板纸", "一等品"],
    ["国产 aa级高瓦纸", "一等品"],
    ["A级高瓦纸", "合格品"],
    ["普通箱板纸", "合格品"],
  ])("maps %s to %s", (text, expected) => {
    expect(inferWarehouseQualityGrade(text)).toBe(expected);
  });
});

describe("warehouse database matching source", () => {
  it("queries only in-stock rolls and caches the result for readiness and material reads", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [createRoll()],
    });
    const source = new WarehouseDatabaseMatchingSourceDataRepository({ query });
    const readinessRepository = new MatchingSourceReadinessRepository(source);
    const materialRepository = new MatchingSourcePaperMaterialRepository(source);

    await readinessRepository.getMatchingReadiness();
    await materialRepository.listRecommendablePaperMaterials();

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM paper_paperroll"),
      ["in_stock"],
    );
  });

  it("excludes non-stock rolls and weight-averages prices for the same material", () => {
    const records = aggregateInStockRolls([
      createRoll({ weight_kg: "1000", unit_price_yuan_per_kg: "2" }),
      createRoll({
        paper_code: "ROLL-2",
        weight_kg: "500",
        unit_price_yuan_per_kg: "4",
      }),
      createRoll({
        paper_code: "WORKSHOP-1",
        status: "workshop",
        weight_kg: "9000",
        unit_price_yuan_per_kg: "99",
      }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      code: "B04001",
      grade: "一等品",
      grammage: 110,
      price: 2666.6666666666665,
      stockWeightKg: 1500,
    });
  });

  it("maps warehouse grades through the restored company strength standards", () => {
    const sourceRecords = aggregateInStockRolls([
      createRoll({
        material_code: "B02001",
        material_category: "进口牛卡纸",
        specification: "130g进口牛卡纸",
        gram_weight: 130,
      }),
      createRoll({
        material_code: "B04002",
        material_category: "国产高瓦纸",
        specification: "110g H级高瓦纸",
        gram_weight: 110,
      }),
    ]);

    expect(mapSourcePaperMaterials(sourceRecords)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paperCode: "B02001",
          paperKind: "linerboard",
          grade: "优等品",
          burstIndex: 4,
          ringCrushIndex: 13.5,
          completenessStatus: "complete",
        }),
        expect.objectContaining({
          paperCode: "B04002",
          paperKind: "corrugating",
          grade: "一等品",
          burstIndex: 0.65,
          ringCrushIndex: 8.4,
          completenessStatus: "complete",
        }),
      ]),
    );
  });

  it("does not block matching when an incomplete material can be excluded", async () => {
    const source = new WarehouseDatabaseMatchingSourceDataRepository({
      async query() {
        return {
          rows: [
            createRoll({
              material_code: "B02001",
              material_category: "国产箱板纸",
              specification: "130g国产箱板纸",
              gram_weight: 130,
            }),
            createRoll({
              material_code: "B04001",
              material_category: "国产高瓦纸",
              specification: "110g H级高瓦纸",
              gram_weight: 110,
            }),
            createRoll({
              material_code: "B08002",
              material_category: "复合纸",
              specification: "300g复合牛皮纸",
              gram_weight: 300,
            }),
          ],
        };
      },
    });

    const readiness = await checkMatchingReadinessFromRepository({
      repository: new MatchingSourceReadinessRepository(source),
    });

    expect(readiness).toMatchObject({ ok: true });
  });
});

function createRoll(
  overrides: Partial<WarehousePaperRollRecord> = {},
): WarehousePaperRollRecord {
  return {
    id: 1,
    paper_code: "ROLL-1",
    material_code: "B04001",
    specification: "110g H级高瓦纸",
    supplier_code: "SUP-1",
    supplier: "测试纸厂",
    gram_weight: 110,
    width_mm: 1250,
    weight_kg: "1000",
    unit_price_yuan_per_kg: "2",
    material_category: "国产高瓦纸",
    status: "in_stock",
    ...overrides,
  };
}
