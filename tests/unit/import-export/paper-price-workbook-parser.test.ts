import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { parsePaperPriceWorkbook } from "@/modules/import-export/master-data-workbook-parser";

async function createWorkbookBuffer(workbook: Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("paper price workbook parser", () => {
  it("extracts supplier, paper product and dated price fields from a price sheet", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("23-3");

    sheet.addRow(["说明", "本行不是表头", "", ""]);
    sheet.addRow(["供应商", "原纸品种", "3月纸价", "3.8纸价"]);
    sheet.addRow(["供应商A", "105g高强瓦楞纸", "3200", "3230"]);

    const result = await parsePaperPriceWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.header).toMatchObject({
      sheetName: "23-3",
      rowNumber: 2,
    });
    expect(result.data.rows).toEqual([
      {
        sheetName: "23-3",
        rowNumber: 3,
        rawData: {
          供应商: "供应商A",
          原纸品种: "105g高强瓦楞纸",
          "3月纸价": "3200",
          "3.8纸价": "3230",
        },
        normalizedData: {
          supplierShortName: "供应商A",
          paperName: "105g高强瓦楞纸",
          prices: [
            {
              header: "3月纸价",
              priceYuanPerTon: 3200,
            },
            {
              header: "3.8纸价",
              effectiveDate: "03-08",
              priceYuanPerTon: 3230,
            },
          ],
        },
        errors: [],
      },
    ]);
  });

  it("reuses the previous supplier when the supplier cell is blank", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("23-3");

    sheet.addRow(["供应商", "原纸品种", "3月纸价"]);
    sheet.addRow(["供应商A", "105g高强瓦楞纸", "3230"]);
    sheet.addRow(["", "120g测试面纸", "3350"]);

    const result = await parsePaperPriceWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[1]?.normalizedData.supplierShortName).toBe("供应商A");
  });

  it("marks invalid price cells and does not include them as valid prices", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("23-3");

    sheet.addRow(["供应商", "原纸品种", "3月纸价", "3.8纸价"]);
    sheet.addRow(["供应商A", "105g高强瓦楞纸", "abc", "3230"]);

    const result = await parsePaperPriceWorkbook(await createWorkbookBuffer(workbook));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData.prices).toEqual([
      {
        header: "3.8纸价",
        effectiveDate: "03-08",
        priceYuanPerTon: 3230,
      },
    ]);
    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "priceYuanPerTon",
      message: "3月纸价不是有效纸价",
    });
  });

  it("returns a diagnostic validation error when no price columns are recognized", async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("23-3");

    sheet.addRow(["供应商", "原纸品种", "备注"]);
    sheet.addRow(["供应商A", "105g高强瓦楞纸", "无价格"]);

    const result = await parsePaperPriceWorkbook(await createWorkbookBuffer(workbook));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "未识别到纸价表头或纸价列",
      },
    });
  });
});
