import { Workbook } from "exceljs";

export interface ImportFieldIssue {
  field: string;
  message: string;
}

export interface PaperCodeNormalizedData {
  paperCode?: string;
  paperEncoding?: string;
  gramWeightGsm?: number;
  supplierShortName?: string;
  paperName?: string;
}

export interface NormalizedPaperCodeImportRow {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: PaperCodeNormalizedData;
  errors: ImportFieldIssue[];
}

interface PaperCodeHeader {
  sheetName: string;
  rowNumber: number;
  columns: {
    paperCode: number;
    paperEncoding: number;
    gramWeightGsm: number;
    supplierShortName: number;
    paperName: number;
  };
}

interface ParsedPaperCodeWorkbook {
  header: PaperCodeHeader;
  rows: NormalizedPaperCodeImportRow[];
}

type ParsePaperCodeWorkbookResult =
  | { ok: true; data: ParsedPaperCodeWorkbook }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
      };
    };

const HEADER_SCAN_ROW_LIMIT = 30;
const HEADER_SCAN_COLUMN_LIMIT = 30;

const PAPER_CODE_HEADER_LABELS = {
  paperCode: "原纸代码",
  paperEncoding: "原纸编码",
  gramWeightGsm: "克重",
  supplierShortName: "原纸供应商简称",
  paperName: "原纸名称",
} as const;

export async function parsePaperCodeWorkbook(
  workbookBuffer: Buffer,
): Promise<ParsePaperCodeWorkbookResult> {
  const workbook = new Workbook();
  await workbook.xlsx.load(workbookBuffer as unknown as ArrayBuffer);

  for (const worksheet of workbook.worksheets) {
    const header = findPaperCodeHeader(worksheet);

    if (!header) {
      continue;
    }

    return {
      ok: true,
      data: {
        header,
        rows: readPaperCodeRows(worksheet, header),
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "未识别到原纸代码表头",
    },
  };
}

function findPaperCodeHeader(
  worksheet: Workbook["worksheets"][number],
): PaperCodeHeader | undefined {
  const maxRow = Math.min(worksheet.rowCount, HEADER_SCAN_ROW_LIMIT);

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = new Map<string, number>();

    for (let columnNumber = 1; columnNumber <= HEADER_SCAN_COLUMN_LIMIT; columnNumber += 1) {
      const text = normalizeHeaderText(getCellText(row.getCell(columnNumber).value));

      if (text) {
        columns.set(text, columnNumber);
      }
    }

    const paperCode = columns.get(normalizeHeaderText(PAPER_CODE_HEADER_LABELS.paperCode));
    const paperEncoding = columns.get(normalizeHeaderText(PAPER_CODE_HEADER_LABELS.paperEncoding));
    const gramWeightGsm = columns.get(normalizeHeaderText(PAPER_CODE_HEADER_LABELS.gramWeightGsm));
    const supplierShortName = columns.get(
      normalizeHeaderText(PAPER_CODE_HEADER_LABELS.supplierShortName),
    );
    const paperName = columns.get(normalizeHeaderText(PAPER_CODE_HEADER_LABELS.paperName));

    if (paperCode && paperEncoding && gramWeightGsm && supplierShortName && paperName) {
      return {
        sheetName: worksheet.name,
        rowNumber,
        columns: {
          paperCode,
          paperEncoding,
          gramWeightGsm,
          supplierShortName,
          paperName,
        },
      };
    }
  }

  return undefined;
}

function readPaperCodeRows(
  worksheet: Workbook["worksheets"][number],
  header: PaperCodeHeader,
): NormalizedPaperCodeImportRow[] {
  const rows: NormalizedPaperCodeImportRow[] = [];

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawData = {
      原纸代码: getCellText(row.getCell(header.columns.paperCode).value),
      原纸编码: getCellText(row.getCell(header.columns.paperEncoding).value),
      克重: getCellText(row.getCell(header.columns.gramWeightGsm).value),
      原纸供应商简称: getCellText(row.getCell(header.columns.supplierShortName).value),
      原纸名称: getCellText(row.getCell(header.columns.paperName).value),
    };

    if (Object.values(rawData).every((value) => value === "")) {
      continue;
    }

    rows.push({
      sheetName: worksheet.name,
      rowNumber,
      rawData,
      normalizedData: normalizePaperCodeRow(rawData),
      errors: getPaperCodeRowParseErrors(rawData),
    });
  }

  return rows;
}

function normalizePaperCodeRow(rawData: Record<string, string>): PaperCodeNormalizedData {
  const normalized: PaperCodeNormalizedData = {
    paperCode: rawData["原纸代码"]?.trim() ?? "",
    paperEncoding: rawData["原纸编码"]?.trim() ?? "",
    supplierShortName: rawData["原纸供应商简称"]?.trim() ?? "",
    paperName: rawData["原纸名称"]?.trim() ?? "",
  };
  const gramWeightText = rawData["克重"]?.trim() ?? "";
  const gramWeightGsm = Number(gramWeightText);

  if (gramWeightText !== "" && Number.isFinite(gramWeightGsm)) {
    normalized.gramWeightGsm = gramWeightGsm;
  }

  return normalized;
}

function getPaperCodeRowParseErrors(rawData: Record<string, string>): ImportFieldIssue[] {
  const errors: ImportFieldIssue[] = [];
  const gramWeightText = rawData["克重"]?.trim() ?? "";

  if (gramWeightText !== "" && !Number.isFinite(Number(gramWeightText))) {
    errors.push({
      field: "gramWeightGsm",
      message: "克重不是有效数值",
    });
  }

  return errors;
}

function normalizeHeaderText(value: string): string {
  return value.replace(/\s+/g, "");
}

function getCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;

  if (typeof record.text === "string") {
    return record.text.trim();
  }

  if (typeof record.result === "string" || typeof record.result === "number") {
    return String(record.result).trim();
  }

  if (Array.isArray(record.richText)) {
    return record.richText
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return "";
        }

        const richTextItem = item as Record<string, unknown>;
        return typeof richTextItem.text === "string" ? richTextItem.text : "";
      })
      .join("")
      .trim();
  }

  return "";
}
