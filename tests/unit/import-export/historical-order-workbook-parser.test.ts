import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import {
  isSupportedHistoricalOrderImportFile,
  parseHistoricalOrderWorkbook,
  validateHistoricalOrderImportFileName,
} from "@/modules/import-export/historical-order-workbook-parser";

async function createWorkbookBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("历史订单");

  for (const row of rows) {
    sheet.addRow(row);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("historical order workbook parser", () => {
  it("locates combined size headers and normalizes key fields", async () => {
    const buffer = await createWorkbookBuffer([
      ["说明", "本行不是表头", "", "", ""],
      ["订单日期", "规格", "产品名称", "生产数量", "纸质", "重量"],
      ["2026/7/1", "300*200*150", "脱敏产品A", "1200", "TEST-A", ""],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.header.sheetName).toBe("历史订单");
    expect(result.data.header.rowNumber).toBe(2);
    expect(result.data.rows[0]?.normalizedData).toEqual({
      orderDate: "2026-07-01",
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      productName: "脱敏产品A",
      quantity: 1200,
      paperCodeText: "TEST-A",
    });
    expect(result.data.rows[0]?.errors).toEqual([]);
  });

  it("reads independent length, width, and height columns", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "长", "宽", "高", "产品名称", "生产数量", "纸质"],
      ["2026-07-02", 310, 210, 160, "脱敏产品B", 800, "TEST-B"],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData.lengthMm).toBe(310);
    expect(result.data.rows[0]?.normalizedData.widthMm).toBe(210);
    expect(result.data.rows[0]?.normalizedData.heightMm).toBe(160);
  });

  it("marks missing order date as a field error", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "规格", "产品名称", "生产数量", "纸质"],
      ["", "300*200*150", "脱敏产品A", 1000, "TEST-A"],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "orderDate",
      message: "缺少订单日期",
    });
  });

  it("supports common size separators", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "规格", "产品名称", "生产数量", "纸质"],
      ["2026-07-01", "300x200x150", "脱敏产品A", 1000, "TEST-A"],
      ["2026-07-01", "300×200×150", "脱敏产品A", 1000, "TEST-A"],
      ["2026-07-01", "300*200*150", "脱敏产品A", 1000, "TEST-A"],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows.map((row) => row.normalizedData)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lengthMm: 300, widthMm: 200, heightMm: 150 }),
        expect.objectContaining({ lengthMm: 300, widthMm: 200, heightMm: 150 }),
        expect.objectContaining({ lengthMm: 300, widthMm: 200, heightMm: 150 }),
      ]),
    );
  });

  it("marks incomplete combined size as a field error", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "规格", "产品名称", "生产数量", "纸质"],
      ["2026-07-01", "300*200", "脱敏产品A", 1000, "TEST-A"],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "size",
      message: "尺寸无法拆解为长宽高",
    });
  });

  it("does not fail rows when optional weight is blank", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "规格", "产品名称", "生产数量", "纸质", "重量"],
      ["2026-07-01", "300*200*150", "脱敏产品A", 1000, "TEST-A", ""],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.normalizedData.weightKg).toBeUndefined();
    expect(result.data.rows[0]?.errors).toEqual([]);
  });

  it("marks invalid quantity as a field error", async () => {
    const buffer = await createWorkbookBuffer([
      ["订单日期", "规格", "产品名称", "生产数量", "纸质"],
      ["2026-07-01", "300*200*150", "脱敏产品A", "abc", "TEST-A"],
    ]);

    const result = await parseHistoricalOrderWorkbook(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.data.rows[0]?.errors).toContainEqual({
      field: "quantity",
      message: "生产数量不是有效数值",
    });
  });

  it("rejects legacy xls file names and asks the user to save as xlsx", () => {
    expect(isSupportedHistoricalOrderImportFile("历史订单.xlsx")).toBe(true);
    expect(isSupportedHistoricalOrderImportFile("近三年订单数据.xls")).toBe(false);
    expect(validateHistoricalOrderImportFileName("近三年订单数据.xls")).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先将历史订单文件另存为 .xlsx 后再导入",
      },
    });
  });
});
