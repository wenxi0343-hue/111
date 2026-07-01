import { describe, expect, it } from "vitest";

import type { NormalizedPaperPriceImportRow } from "@/modules/import-export/master-data-workbook-parser";
import {
  buildPaperPriceSourceSignature,
  createPaperPriceImportPreview,
  type ExistingPaperMaterialForPricePreview,
} from "@/modules/master-data/import-preview";

function createPriceRow(
  overrides: Partial<NormalizedPaperPriceImportRow> = {},
): NormalizedPaperPriceImportRow {
  return {
    sheetName: "23-3",
    rowNumber: 2,
    rawData: {},
    normalizedData: {
      supplierShortName: "供应商A",
      paperName: "105g高强瓦楞纸",
      prices: [{ header: "3.8纸价", effectiveDate: "03-08", priceYuanPerTon: 3230 }],
    },
    errors: [],
    ...overrides,
  };
}

function createMaterial(
  overrides: Partial<ExistingPaperMaterialForPricePreview> = {},
): ExistingPaperMaterialForPricePreview {
  return {
    id: "paper-1",
    paperCode: "r2",
    paperEncoding: "B04033",
    factoryName: "供应商A",
    name: "105g高强瓦楞纸",
    gramWeightGsm: 105,
    priceYuanPerTon: 3200,
    ...overrides,
  };
}

describe("paper price import preview", () => {
  it("matches an existing material by exact case-sensitive paper code", () => {
    const preview = createPaperPriceImportPreview({
      rows: [
        createPriceRow({
          normalizedData: {
            ...createPriceRow().normalizedData,
            paperCode: "r2",
          },
        }),
      ],
      existingMaterials: [createMaterial()],
      confirmedMatchRules: [],
    });

    expect(preview.summary).toMatchObject({
      updateCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
      candidateMaterialIds: [],
      changeSet: {
        price_yuan_per_ton: { before: 3200, after: 3230 },
      },
    });
  });

  it("does not auto-match a paper code that only differs by case", () => {
    const preview = createPaperPriceImportPreview({
      rows: [
        createPriceRow({
          normalizedData: {
            ...createPriceRow().normalizedData,
            supplierShortName: "供应商A",
            paperName: "105g高强瓦楞纸",
            paperCode: "dc",
            prices: [{ header: "3.8纸价", effectiveDate: "03-08", priceYuanPerTon: 3230 }],
          },
        }),
      ],
      existingMaterials: [
        createMaterial({
          id: "paper-upper",
          paperCode: "DC",
          paperEncoding: undefined,
          factoryName: "供应商B",
          name: "其他原纸",
        }),
      ],
      confirmedMatchRules: [],
    });

    expect(preview.summary).toMatchObject({
      updateCount: 0,
      pendingCount: 0,
      failedCount: 1,
    });
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "failed",
      candidateMaterialIds: [],
      errors: [{ field: "paperMaterialId", message: "无法关联原纸" }],
    });
  });

  it("puts duplicate paper encoding matches into pending instead of picking one", () => {
    const preview = createPaperPriceImportPreview({
      rows: [
        createPriceRow({
          normalizedData: {
            ...createPriceRow().normalizedData,
            paperEncoding: "B02022",
          },
        }),
      ],
      existingMaterials: [
        createMaterial({ id: "paper-1", paperCode: "r2", paperEncoding: "B02022" }),
        createMaterial({ id: "paper-2", paperCode: "r3", paperEncoding: "B02022" }),
      ],
      confirmedMatchRules: [],
    });

    expect(preview.summary).toMatchObject({
      updateCount: 0,
      pendingCount: 1,
      failedCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "pending",
      candidateMaterialIds: ["paper-1", "paper-2"],
      errors: [{ field: "paperMaterialId", message: "原纸编码匹配到多张原纸，请人工确认" }],
    });
  });

  it("uses confirmed match rules before automatic matching", () => {
    const row = createPriceRow({
      normalizedData: {
        ...createPriceRow().normalizedData,
        paperCode: "missing-code",
      },
    });
    const sourceSignature = buildPaperPriceSourceSignature(row.normalizedData);

    const preview = createPaperPriceImportPreview({
      rows: [row],
      existingMaterials: [
        createMaterial({ id: "paper-1", paperCode: "r2" }),
        createMaterial({ id: "paper-2", paperCode: "r3", name: "其他原纸" }),
      ],
      confirmedMatchRules: [
        {
          sourceType: "paper_price_table",
          sourceSignature,
          paperMaterialId: "paper-2",
        },
      ],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-2",
    });
  });

  it("matches by supplier, paper product and gram weight when the combination is unique", () => {
    const preview = createPaperPriceImportPreview({
      rows: [createPriceRow()],
      existingMaterials: [createMaterial()],
      confirmedMatchRules: [],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
    });
  });

  it("keeps multiple supplier and product combination matches pending", () => {
    const preview = createPaperPriceImportPreview({
      rows: [createPriceRow()],
      existingMaterials: [
        createMaterial({ id: "paper-1", paperCode: "r2" }),
        createMaterial({ id: "paper-2", paperCode: "r3" }),
      ],
      confirmedMatchRules: [],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "pending",
      candidateMaterialIds: ["paper-1", "paper-2"],
      errors: [{ field: "paperMaterialId", message: "组合信息匹配到多张原纸，请人工确认" }],
    });
  });

  it("fails rows that have no matching material candidates", () => {
    const preview = createPaperPriceImportPreview({
      rows: [createPriceRow()],
      existingMaterials: [createMaterial({ factoryName: "供应商B", name: "其他原纸" })],
      confirmedMatchRules: [],
    });

    expect(preview.summary.failedCount).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "failed",
      errors: [{ field: "paperMaterialId", message: "无法关联原纸" }],
    });
  });
});
