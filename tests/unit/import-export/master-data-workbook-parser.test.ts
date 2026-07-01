import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import {
  parsePaperCodeCsv,
  parsePaperCodeWorkbook,
} from "@/modules/import-export/master-data-workbook-parser";

async function createPaperCodeWorkbookBuffer(): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("原纸代码总表");

  sheet.addRow(["脱敏测试表", "", "", "", ""]);
  sheet.addRow(["说明", "本行不是表头", "", "", ""]);
  sheet.addRow(["原纸代码", "原纸编码", "克重", "原纸供应商简称", "原纸名称"]);
  sheet.addRow(["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"]);
  sheet.addRow(["a未", "B05001", 120, "供应商B", "120g测试面纸"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("master data workbook parser", () => {
  it("locates paper code table headers and normalizes rows from an xlsx workbook", async () => {
    const result = await parsePaperCodeWorkbook(await createPaperCodeWorkbookBuffer());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.header.sheetName).toBe("原纸代码总表");
    expect(result.data.header.rowNumber).toBe(3);
    expect(result.data.rows).toEqual([
      {
        sheetName: "原纸代码总表",
        rowNumber: 4,
        rawData: {
          原纸代码: "r2",
          原纸编码: "B04033",
          克重: "105",
          原纸供应商简称: "供应商A",
          原纸名称: "105g高强瓦楞纸",
        },
        normalizedData: {
          paperCode: "r2",
          paperEncoding: "B04033",
          gramWeightGsm: 105,
          supplierShortName: "供应商A",
          paperName: "105g高强瓦楞纸",
        },
        errors: [],
      },
      {
        sheetName: "原纸代码总表",
        rowNumber: 5,
        rawData: {
          原纸代码: "a未",
          原纸编码: "B05001",
          克重: "120",
          原纸供应商简称: "供应商B",
          原纸名称: "120g测试面纸",
        },
        normalizedData: {
          paperCode: "a未",
          paperEncoding: "B05001",
          gramWeightGsm: 120,
          supplierShortName: "供应商B",
          paperName: "120g测试面纸",
        },
        errors: [],
      },
    ]);
  });

  it("marks invalid numeric fields without trusting the imported content", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("原纸代码总表");
    sheet.addRow(["原纸代码", "原纸编码", "克重", "原纸供应商简称", "原纸名称"]);
    sheet.addRow(["r2", "B04033", "abc", "供应商A", "105g高强瓦楞纸"]);

    const result = await parsePaperCodeWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData.gramWeightGsm).toBeUndefined();
    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "gramWeightGsm",
      message: "克重不是有效数值",
    });
  });

  it("locates paper code table headers and normalizes rows from a csv file", async () => {
    const csv = [
      "说明,本行不是表头,,,",
      "原纸代码,原纸编码,克重,原纸供应商简称,原纸名称",
      "r2,B04033,105,供应商A,105g高强瓦楞纸",
    ].join("\n");

    const result = await parsePaperCodeCsv(csv);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.header.sheetName).toBe("CSV");
    expect(result.data.header.rowNumber).toBe(2);
    expect(result.data.rows).toEqual([
      {
        sheetName: "CSV",
        rowNumber: 3,
        rawData: {
          原纸代码: "r2",
          原纸编码: "B04033",
          克重: "105",
          原纸供应商简称: "供应商A",
          原纸名称: "105g高强瓦楞纸",
        },
        normalizedData: {
          paperCode: "r2",
          paperEncoding: "B04033",
          gramWeightGsm: 105,
          supplierShortName: "供应商A",
          paperName: "105g高强瓦楞纸",
        },
        errors: [],
      },
    ]);
  });
});
