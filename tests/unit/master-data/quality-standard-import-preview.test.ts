import { describe, expect, it } from "vitest";

import type { NormalizedQualityStandardImportRow } from "@/modules/import-export/master-data-workbook-parser";
import {
  createQualityStandardImportPreview,
  type ExistingPaperMaterialForQualityStandardPreview,
} from "@/modules/master-data/import-preview";

function createQualityRow(
  overrides: Partial<NormalizedQualityStandardImportRow> = {},
): NormalizedQualityStandardImportRow {
  return {
    sheetName: "瓦纸标准",
    rowNumber: 2,
    rawData: {},
    normalizedData: {
      paperKind: "corrugating",
      grade: "A",
      gramWeightMinGsm: 100,
      gramWeightMaxGsm: 120,
      rawLabel: "耐破指数",
      scope: "paper_kind_standard",
      burstIndex: 2.2,
    },
    errors: [],
    ...overrides,
  };
}

function createRingCrushRow(rowNumber = 3): NormalizedQualityStandardImportRow {
  return createQualityRow({
    rowNumber,
    normalizedData: {
      paperKind: "corrugating",
      grade: "A",
      gramWeightMinGsm: 100,
      gramWeightMaxGsm: 120,
      rawLabel: "横向环压指数",
      scope: "paper_kind_standard",
      ringCrushIndex: 7.5,
    },
  });
}

function createMaterial(
  overrides: Partial<ExistingPaperMaterialForQualityStandardPreview> = {},
): ExistingPaperMaterialForQualityStandardPreview {
  return {
    id: "paper-1",
    paperCode: "r2",
    factoryName: "供应商A",
    name: "105g高强瓦楞纸",
    paperKind: "corrugating",
    grade: "A",
    gramWeightGsm: 105,
    priceYuanPerTon: 3200,
    ...overrides,
  };
}

describe("quality standard import preview", () => {
  it("updates the uniquely matched material with burst and ring crush indexes", () => {
    const preview = createQualityStandardImportPreview({
      rows: [createQualityRow({ rowNumber: 2 }), createRingCrushRow(3)],
      existingMaterials: [createMaterial()],
    });

    expect(preview.summary).toMatchObject({
      updateCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
      sourceRowNumbers: [2, 3],
      changeSet: {
        burst_index: { before: null, after: 2.2 },
        ring_crush_index: { before: null, after: 7.5 },
      },
    });
  });

  it("keeps paper-kind ranges as standard rules when no unique material can be chosen", () => {
    const preview = createQualityStandardImportPreview({
      rows: [createQualityRow()],
      existingMaterials: [],
    });

    expect(preview.summary.updateCount).toBe(0);
    expect(preview.summary.pendingCount).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "standard_rule",
      standardRule: {
        paperKind: "corrugating",
        grade: "A",
        gramWeightMinGsm: 100,
        gramWeightMaxGsm: 120,
        burstIndex: 2.2,
      },
    });
    expect(preview.rows[0]?.targetMaterialId).toBeUndefined();
    expect(preview.rows[0]?.notice).toContain("将写入纸类标准规则");
  });

  it("recalculates completeness after filling strength fields but keeps missing price", () => {
    const preview = createQualityStandardImportPreview({
      rows: [createQualityRow(), createRingCrushRow()],
      existingMaterials: [createMaterial({ priceYuanPerTon: undefined })],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      completenessStatus: "incomplete",
      missingFields: ["priceYuanPerTon"],
    });
  });

  it("marks the material complete when the imported indicators fill the last gaps", () => {
    const preview = createQualityStandardImportPreview({
      rows: [createQualityRow(), createRingCrushRow()],
      existingMaterials: [createMaterial()],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "update",
      completenessStatus: "complete",
      missingFields: [],
    });
  });
});
