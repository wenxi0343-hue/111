import { describe, expect, it } from "vitest";

import {
  createPaperCodeImportPreview,
  type NormalizedPaperCodeImportRow,
} from "@/modules/master-data/import-preview";

function createRow(
  overrides: Partial<NormalizedPaperCodeImportRow> = {},
): NormalizedPaperCodeImportRow {
  return {
    sheetName: "原纸代码总表",
    rowNumber: 2,
    rawData: {},
    normalizedData: {
      paperCode: "r2",
      paperEncoding: "B04033",
      gramWeightGsm: 105,
      supplierShortName: "供应商A",
      paperName: "105g高强瓦楞纸",
    },
    errors: [],
    ...overrides,
  };
}

describe("paper code import preview", () => {
  it("creates a new preview row and marks basic paper code table data as incomplete", () => {
    const preview = createPaperCodeImportPreview({
      rows: [createRow()],
      existingMaterials: [],
    });

    expect(preview.summary).toEqual({
      newCount: 1,
      updateCount: 0,
      pendingCount: 0,
      failedCount: 0,
      incompleteCount: 1,
    });
    expect(preview.rows[0]).toMatchObject({
      rowStatus: "new",
      factoryName: "供应商A",
      completenessStatus: "incomplete",
      missingFields: expect.arrayContaining(["paperKind", "priceYuanPerTon", "burstIndex"]),
    });
  });

  it("fails every row that repeats the same paper code in one batch", () => {
    const preview = createPaperCodeImportPreview({
      rows: [
        createRow({ rowNumber: 2 }),
        createRow({
          rowNumber: 3,
          normalizedData: { ...createRow().normalizedData, paperEncoding: "B04034" },
        }),
      ],
      existingMaterials: [],
    });

    expect(preview.summary.failedCount).toBe(2);
    expect(preview.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          rowStatus: "failed",
          errors: expect.arrayContaining([{ field: "paperCode", message: "原纸代码重复：r2" }]),
        }),
        expect.objectContaining({
          rowNumber: 3,
          rowStatus: "failed",
          errors: expect.arrayContaining([{ field: "paperCode", message: "原纸代码重复：r2" }]),
        }),
      ]),
    );
  });

  it("allows repeated paper encoding and keeps it as an auxiliary hint", () => {
    const preview = createPaperCodeImportPreview({
      rows: [
        createRow({ rowNumber: 2 }),
        createRow({
          rowNumber: 3,
          normalizedData: {
            ...createRow().normalizedData,
            paperCode: "r3",
          },
        }),
      ],
      existingMaterials: [],
    });

    expect(preview.summary.failedCount).toBe(0);
    expect(preview.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 2,
          warnings: expect.arrayContaining([
            { field: "paperEncoding", message: "原纸编码仅作辅助关联字段，可重复" },
          ]),
        }),
        expect.objectContaining({
          rowNumber: 3,
          warnings: expect.arrayContaining([
            { field: "paperEncoding", message: "原纸编码仅作辅助关联字段，可重复" },
          ]),
        }),
      ]),
    );
  });

  it("fails rows missing required paper code table fields", () => {
    const preview = createPaperCodeImportPreview({
      rows: [
        createRow({
          normalizedData: {
            paperCode: "",
            paperEncoding: "B04033",
            gramWeightGsm: 105,
            supplierShortName: "",
            paperName: "105g高强瓦楞纸",
          },
        }),
      ],
      existingMaterials: [],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "failed",
      errors: expect.arrayContaining([
        { field: "paperCode", message: "缺少原纸代码" },
        { field: "supplierShortName", message: "缺少原纸供应商简称" },
      ]),
    });
  });
});
