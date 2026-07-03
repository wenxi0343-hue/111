import { Workbook } from "exceljs";
import type { CellValue, Worksheet } from "exceljs";

export interface HistoricalOrderImportFieldIssue {
  field: string;
  message: string;
}

export interface HistoricalOrderNormalizedData {
  orderDate?: string;
  productName?: string;
  productCategory?: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  quantity?: number;
  weightKg?: number;
  paperCodeText?: string;
}

export interface NormalizedHistoricalOrderImportRow {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: HistoricalOrderNormalizedData;
  errors: HistoricalOrderImportFieldIssue[];
}

export interface HistoricalOrderHeader {
  sheetName: string;
  rowNumber: number;
  columns: {
    orderDate: number;
    productName: number;
    quantity: number;
    paperCodeText: number;
    size?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    weightKg?: number;
  };
}

interface ParsedHistoricalOrderWorkbook {
  header: HistoricalOrderHeader;
  rows: NormalizedHistoricalOrderImportRow[];
}

interface ParsedDimensions {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

type ParseHistoricalOrderWorkbookResult =
  | { ok: true; data: ParsedHistoricalOrderWorkbook }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
      };
    };

type HistoricalOrderFileNameValidationResult =
  | { ok: true }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
      };
    };

const HEADER_SCAN_ROW_LIMIT = 30;
const HEADER_SCAN_COLUMN_LIMIT = 40;

const ORDER_DATE_LABELS = ["订单日期", "日期", "下单日期", "生产日期"] as const;
const SIZE_LABELS = ["规格", "尺寸", "纸箱尺寸", "订单规格"] as const;
const LENGTH_LABELS = ["长", "长度", "长mm", "l"] as const;
const WIDTH_LABELS = ["宽", "宽度", "宽mm", "w"] as const;
const HEIGHT_LABELS = ["高", "高度", "高mm", "h"] as const;
const PRODUCT_NAME_LABELS = ["产品名称", "产品类别", "产品类型", "品名", "名称"] as const;
const QUANTITY_LABELS = ["生产数量", "数量", "订单数量", "订单数"] as const;
const PAPER_CODE_LABELS = ["纸质", "配纸代码", "纸质代码", "原纸代码", "配纸"] as const;
const WEIGHT_LABELS = ["重量", "内装物重量", "单箱重量", "重量kg"] as const;

export async function parseHistoricalOrderWorkbook(
  workbookBuffer: Buffer,
): Promise<ParseHistoricalOrderWorkbookResult> {
  const workbook = new Workbook();
  await workbook.xlsx.load(workbookBuffer as unknown as ArrayBuffer);

  for (const worksheet of workbook.worksheets) {
    const header = findHistoricalOrderHeader(worksheet);

    if (!header) {
      continue;
    }

    return {
      ok: true,
      data: {
        header,
        rows: readHistoricalOrderRows(worksheet, header),
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "未识别到历史订单表头，请确认文件包含订单日期、规格或长宽高、产品名称、生产数量、纸质列",
    },
  };
}

export function isSupportedHistoricalOrderImportFile(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith(".xlsx");
}

export function validateHistoricalOrderImportFileName(
  fileName: string,
): HistoricalOrderFileNameValidationResult {
  if (isSupportedHistoricalOrderImportFile(fileName)) {
    return { ok: true };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "请先将历史订单文件另存为 .xlsx 后再导入",
    },
  };
}

function findHistoricalOrderHeader(worksheet: Worksheet): HistoricalOrderHeader | undefined {
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

    const orderDate = getFirstMatchingColumn(columns, ORDER_DATE_LABELS);
    const productName = getFirstMatchingColumn(columns, PRODUCT_NAME_LABELS);
    const quantity = getFirstMatchingColumn(columns, QUANTITY_LABELS);
    const paperCodeText = getFirstMatchingColumn(columns, PAPER_CODE_LABELS);
    const size = getFirstMatchingColumn(columns, SIZE_LABELS);
    const lengthMm = getFirstMatchingColumn(columns, LENGTH_LABELS);
    const widthMm = getFirstMatchingColumn(columns, WIDTH_LABELS);
    const heightMm = getFirstMatchingColumn(columns, HEIGHT_LABELS);
    const weightKg = getFirstMatchingColumn(columns, WEIGHT_LABELS);
    const hasDimensions = Boolean(size) || Boolean(lengthMm && widthMm && heightMm);

    if (orderDate && productName && quantity && paperCodeText && hasDimensions) {
      return {
        sheetName: worksheet.name,
        rowNumber,
        columns: {
          orderDate,
          productName,
          quantity,
          paperCodeText,
          ...(size !== undefined ? { size } : {}),
          ...(lengthMm !== undefined ? { lengthMm } : {}),
          ...(widthMm !== undefined ? { widthMm } : {}),
          ...(heightMm !== undefined ? { heightMm } : {}),
          ...(weightKg !== undefined ? { weightKg } : {}),
        },
      };
    }
  }

  return undefined;
}

function readHistoricalOrderRows(
  worksheet: Worksheet,
  header: HistoricalOrderHeader,
): NormalizedHistoricalOrderImportRow[] {
  const rows: NormalizedHistoricalOrderImportRow[] = [];

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawData = getRawHistoricalOrderRowData(row, header);

    if (Object.values(rawData).every((value) => value === "")) {
      continue;
    }

    const normalizedData = normalizeHistoricalOrderRow(rawData);

    rows.push({
      sheetName: worksheet.name,
      rowNumber,
      rawData,
      normalizedData,
      errors: getHistoricalOrderRowParseErrors(rawData, normalizedData),
    });
  }

  return rows;
}

function getRawHistoricalOrderRowData(
  row: ReturnType<Worksheet["getRow"]>,
  header: HistoricalOrderHeader,
): Record<string, string> {
  return {
    订单日期: getCellText(row.getCell(header.columns.orderDate).value),
    规格:
      header.columns.size !== undefined ? getCellText(row.getCell(header.columns.size).value) : "",
    长:
      header.columns.lengthMm !== undefined
        ? getCellText(row.getCell(header.columns.lengthMm).value)
        : "",
    宽:
      header.columns.widthMm !== undefined
        ? getCellText(row.getCell(header.columns.widthMm).value)
        : "",
    高:
      header.columns.heightMm !== undefined
        ? getCellText(row.getCell(header.columns.heightMm).value)
        : "",
    产品名称: getCellText(row.getCell(header.columns.productName).value),
    生产数量: getCellText(row.getCell(header.columns.quantity).value),
    纸质: getCellText(row.getCell(header.columns.paperCodeText).value),
    重量:
      header.columns.weightKg !== undefined
        ? getCellText(row.getCell(header.columns.weightKg).value)
        : "",
  };
}

function normalizeHistoricalOrderRow(
  rawData: Record<string, string>,
): HistoricalOrderNormalizedData {
  const normalized: HistoricalOrderNormalizedData = {};
  const orderDate = normalizeDateText(rawData["订单日期"] ?? "");
  const productName = rawData["产品名称"]?.trim() ?? "";
  const quantity = parseImportedNumber(rawData["生产数量"] ?? "");
  const weightKg = parseImportedNumber(rawData["重量"] ?? "");
  const dimensions = parseDimensions(rawData);
  const paperCodeText = rawData["纸质"]?.trim() ?? "";

  if (orderDate !== undefined) {
    normalized.orderDate = orderDate;
  }

  if (productName) {
    normalized.productName = productName;
  }

  if (quantity !== undefined) {
    normalized.quantity = quantity;
  }

  if (weightKg !== undefined) {
    normalized.weightKg = weightKg;
  }

  if (dimensions !== undefined) {
    normalized.lengthMm = dimensions.lengthMm;
    normalized.widthMm = dimensions.widthMm;
    normalized.heightMm = dimensions.heightMm;
  }

  if (paperCodeText) {
    normalized.paperCodeText = paperCodeText;
  }

  return normalized;
}

function getHistoricalOrderRowParseErrors(
  rawData: Record<string, string>,
  normalizedData: HistoricalOrderNormalizedData,
): HistoricalOrderImportFieldIssue[] {
  const errors: HistoricalOrderImportFieldIssue[] = [];
  const orderDateText = rawData["订单日期"]?.trim() ?? "";
  const productName = rawData["产品名称"]?.trim() ?? "";
  const quantityText = rawData["生产数量"]?.trim() ?? "";
  const paperCodeText = rawData["纸质"]?.trim() ?? "";
  const weightText = rawData["重量"]?.trim() ?? "";

  if (!orderDateText) {
    errors.push({ field: "orderDate", message: "缺少订单日期" });
  } else if (normalizedData.orderDate === undefined) {
    errors.push({ field: "orderDate", message: "订单日期不是有效日期" });
  }

  if (!productName) {
    errors.push({ field: "productName", message: "缺少产品名称或类别" });
  }

  if (!quantityText) {
    errors.push({ field: "quantity", message: "缺少生产数量" });
  } else if (normalizedData.quantity === undefined) {
    errors.push({ field: "quantity", message: "生产数量不是有效数值" });
  }

  if (!paperCodeText) {
    errors.push({ field: "paperCodeText", message: "缺少纸质/配纸代码" });
  }

  if (
    normalizedData.lengthMm === undefined ||
    normalizedData.widthMm === undefined ||
    normalizedData.heightMm === undefined
  ) {
    errors.push({ field: "size", message: "尺寸无法拆解为长宽高" });
  }

  if (weightText !== "" && normalizedData.weightKg === undefined) {
    errors.push({ field: "weightKg", message: "重量不是有效数值" });
  }

  return errors;
}

function parseDimensions(rawData: Record<string, string>): ParsedDimensions | undefined {
  const sizeText = rawData["规格"]?.trim() ?? "";

  if (sizeText) {
    const match = sizeText.match(
      /(?<length>\d+(?:\.\d+)?)\s*[xX*×]\s*(?<width>\d+(?:\.\d+)?)\s*[xX*×]\s*(?<height>\d+(?:\.\d+)?)/u,
    );
    const length = match?.groups?.length;
    const width = match?.groups?.width;
    const height = match?.groups?.height;

    if (!length || !width || !height) {
      return undefined;
    }

    return {
      lengthMm: Number(length),
      widthMm: Number(width),
      heightMm: Number(height),
    };
  }

  const lengthMm = parseImportedNumber(rawData["长"] ?? "");
  const widthMm = parseImportedNumber(rawData["宽"] ?? "");
  const heightMm = parseImportedNumber(rawData["高"] ?? "");

  if (lengthMm === undefined || widthMm === undefined || heightMm === undefined) {
    return undefined;
  }

  return {
    lengthMm,
    widthMm,
    heightMm,
  };
}

function normalizeDateText(value: string): string | undefined {
  const text = value.trim();

  if (!text) {
    return undefined;
  }

  const normalizedText = text.includes("T") ? text.slice(0, 10) : text;
  const match = normalizedText.match(
    /^(?<year>\d{4})[-/.年](?<month>\d{1,2})[-/.月](?<day>\d{1,2})日?$/u,
  );
  const year = match?.groups?.year;
  const month = match?.groups?.month;
  const day = match?.groups?.day;

  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseImportedNumber(value: string): number | undefined {
  const normalizedValue = value.replace(/,/g, "").replace(/kg|KG|公斤/gu, "").trim();
  const numberValue = Number(normalizedValue);

  return normalizedValue !== "" && Number.isFinite(numberValue) ? numberValue : undefined;
}

function getFirstMatchingColumn(
  columns: Map<string, number>,
  labels: readonly string[],
): number | undefined {
  for (const label of labels) {
    const column = columns.get(normalizeHeaderText(label));

    if (column) {
      return column;
    }
  }

  return undefined;
}

function normalizeHeaderText(value: string): string {
  return value.replace(/[\s:：]/g, "").toLowerCase();
}

function getCellText(value: CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as unknown as Record<string, unknown>;

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
