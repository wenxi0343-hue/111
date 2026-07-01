import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { parseQualityStandardWorkbook } from "@/modules/import-export/master-data-workbook-parser";

async function createWorkbookBuffer(workbook: Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("quality standard workbook parser", () => {
  it("extracts corrugating paper standard records from a 瓦纸标准 sheet", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("瓦纸标准");

    sheet.addRow(["说明", "本行不是表头", "", "", "", ""]);
    sheet.addRow(["物理指标", "单位", "等级", "克重下限", "克重上限", "标准值"]);
    sheet.addRow(["横向环压指数", "N·m/g", "A级", 105, 120, "7.5"]);

    const result = await parseQualityStandardWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.header).toMatchObject({
      sheetName: "瓦纸标准",
      rowNumber: 2,
    });
    expect(result.data.rows).toEqual([
      {
        sheetName: "瓦纸标准",
        rowNumber: 3,
        rawData: {
          物理指标: "横向环压指数",
          单位: "N·m/g",
          等级: "A级",
          克重下限: "105",
          克重上限: "120",
          标准值: "7.5",
        },
        normalizedData: {
          paperKind: "corrugating",
          grade: "A级",
          gramWeightMinGsm: 105,
          gramWeightMaxGsm: 120,
          ringCrushIndex: 7.5,
          rawLabel: "横向环压指数",
          scope: "paper_kind_standard",
        },
        errors: [],
      },
    ]);
  });

  it("extracts linerboard standard records from a 箱板纸标准 sheet", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("箱板纸标准");

    sheet.addRow(["物理指标", "单位", "等级", "克重下限", "克重上限", "标准值"]);
    sheet.addRow(["耐破指数", "kPa·m²/g", "B级", "130", "160", "2.8"]);

    const result = await parseQualityStandardWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData).toEqual({
      paperKind: "linerboard",
      grade: "B级",
      gramWeightMinGsm: 130,
      gramWeightMaxGsm: 160,
      burstIndex: 2.8,
      rawLabel: "耐破指数",
      scope: "paper_kind_standard",
    });
  });

  it("marks invalid burst or ring crush values without writing that metric", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("瓦纸标准");

    sheet.addRow(["物理指标", "单位", "等级", "克重下限", "克重上限", "标准值"]);
    sheet.addRow(["横向环压指数", "N·m/g", "A级", "105", "120", "abc"]);

    const result = await parseQualityStandardWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData.ringCrushIndex).toBeUndefined();
    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "ringCrushIndex",
      message: "横向环压指数不是有效数值",
    });
  });

  it("returns standard rules only and never targets a concrete paper material", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("质量标准");

    sheet.addRow(["物理指标", "单位", "等级", "克重下限", "克重上限", "标准值"]);
    sheet.addRow(["耐破指数", "kPa·m²/g", "A级", "120", "140", "3.1"]);

    const result = await parseQualityStandardWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData).toMatchObject({
      scope: "paper_kind_standard",
      paperKind: "unknown",
    });
    expect(result.data.rows[0]?.normalizedData).not.toHaveProperty("targetMaterialId");
  });
});
