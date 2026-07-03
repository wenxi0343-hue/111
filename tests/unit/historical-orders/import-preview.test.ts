import { describe, expect, it } from "vitest";

import type {
  HistoricalOrderNormalizedData,
  NormalizedHistoricalOrderImportRow,
} from "@/modules/import-export/historical-order-workbook-parser";
import { createHistoricalOrderImportPreview } from "@/modules/historical-orders/import-preview";

function createParsedRow(
  overrides: Partial<NormalizedHistoricalOrderImportRow> & {
    paperCodeText?: string | undefined;
    errors?: NormalizedHistoricalOrderImportRow["errors"];
    omitNormalizedFields?: Array<keyof HistoricalOrderNormalizedData>;
  } = {},
): NormalizedHistoricalOrderImportRow {
  const normalizedData: HistoricalOrderNormalizedData = {
    orderDate: "2026-07-01",
    productName: "脱敏产品",
    lengthMm: 300,
    widthMm: 200,
    heightMm: 150,
    quantity: 1000,
    ...(overrides.paperCodeText !== undefined
      ? { paperCodeText: overrides.paperCodeText }
      : {
          paperCodeText: "r2",
        }),
    ...overrides.normalizedData,
  };

  for (const field of overrides.omitNormalizedFields ?? []) {
    delete normalizedData[field];
  }

  return {
    sheetName: "历史订单",
    rowNumber: overrides.rowNumber ?? 2,
    rawData: {
      订单日期: "2026-07-01",
      规格: "300*200*150",
      长: "",
      宽: "",
      高: "",
      产品名称: "脱敏产品",
      生产数量: "1000",
      纸质: overrides.paperCodeText ?? "r2",
      重量: "",
    },
    normalizedData,
    errors: overrides.errors ?? [],
    ...overrides,
  };
}

const materials = [
  {
    id: "material-r2",
    paperCode: "r2",
    factoryName: "脱敏纸厂A",
    gramWeightGsm: 105,
  },
  {
    id: "material-dc",
    paperCode: "DC",
    factoryName: "脱敏纸厂B",
    gramWeightGsm: 120,
  },
  {
    id: "material-dc-alt",
    paperCode: "dC",
    factoryName: "脱敏纸厂C",
    gramWeightGsm: 130,
  },
];

describe("historical order import preview", () => {
  it("marks complete rows with exact paper-code match as statistical", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [createParsedRow()],
      existingMaterials: materials,
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "statistical",
      matchedMaterialIds: ["material-r2"],
      candidateMaterialIds: [],
      errors: [],
    });
    expect(preview.rows[0]?.paperCodeMatchResult.status).toBe("matched");
    expect(preview.summary).toEqual({
      importedCount: 1,
      statisticalCount: 1,
      pendingCount: 0,
      exceptionCount: 0,
      failedCount: 0,
    });
  });

  it("marks rows with non-paper-code field errors as failed", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [
        createParsedRow({
          omitNormalizedFields: ["productName"],
          errors: [{ field: "productName", message: "缺少产品名称或类别" }],
        }),
      ],
      existingMaterials: materials,
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "failed",
      matchedMaterialIds: [],
      candidateMaterialIds: [],
      errors: [{ field: "productName", message: "缺少产品名称或类别" }],
    });
  });

  it("keeps empty paper-code rows importable as exceptions", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [
        createParsedRow({
          paperCodeText: "",
          omitNormalizedFields: ["paperCodeText"],
          errors: [{ field: "paperCodeText", message: "缺少纸质/配纸代码" }],
        }),
      ],
      existingMaterials: materials,
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "exception",
      matchedMaterialIds: [],
      candidateMaterialIds: [],
    });
    expect(preview.rows[0]?.paperCodeMatchResult.status).toBe("empty");
  });

  it("marks suspected gram weight codes as exceptions", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [createParsedRow({ paperCodeText: "250g" })],
      existingMaterials: materials,
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "exception",
      errors: [expect.objectContaining({ message: expect.stringContaining("疑似克重误填") })],
    });
    expect(preview.rows[0]?.paperCodeMatchResult.status).toBe("suspected_gram_weight");
  });

  it("keeps case-mismatch candidates pending without replacing the original code", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [createParsedRow({ paperCodeText: "dc" })],
      existingMaterials: [materials[1]!],
    });

    expect(preview.rows[0]).toMatchObject({
      rowStatus: "pending",
      matchedMaterialIds: [],
      candidateMaterialIds: ["material-dc"],
      normalizedData: expect.objectContaining({ paperCodeText: "dc" }),
    });
    expect(preview.rows[0]?.paperCodeMatchResult.status).toBe("case_mismatch");
  });

  it("summarizes statistical, pending, exception, and failed rows", () => {
    const preview = createHistoricalOrderImportPreview({
      rows: [
        createParsedRow({ rowNumber: 2, paperCodeText: "r2" }),
        createParsedRow({ rowNumber: 3, paperCodeText: "r2" }),
        createParsedRow({ rowNumber: 4, paperCodeText: "dc" }),
        createParsedRow({ rowNumber: 5, paperCodeText: "250g" }),
        createParsedRow({
          rowNumber: 6,
          omitNormalizedFields: ["quantity"],
          errors: [{ field: "quantity", message: "生产数量不是有效数值" }],
        }),
      ],
      existingMaterials: materials,
    });

    expect(preview.summary).toEqual({
      importedCount: 4,
      statisticalCount: 2,
      pendingCount: 1,
      exceptionCount: 1,
      failedCount: 1,
    });
  });
});
