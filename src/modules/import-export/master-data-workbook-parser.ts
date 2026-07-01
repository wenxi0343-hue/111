import { Workbook } from "exceljs";
import Papa from "papaparse";

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

export interface PaperPriceEntry {
  header: string;
  effectiveDate?: string;
  priceYuanPerTon: number;
}

export interface PaperPriceNormalizedData {
  paperCode?: string;
  paperEncoding?: string;
  gramWeightGsm?: number;
  supplierShortName?: string;
  paperName?: string;
  prices: PaperPriceEntry[];
}

export interface NormalizedPaperPriceImportRow {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: PaperPriceNormalizedData;
  errors: ImportFieldIssue[];
}

export type QualityStandardPaperKind = "linerboard" | "corrugating" | "unknown";

export interface QualityStandardNormalizedData {
  paperKind: QualityStandardPaperKind;
  grade?: string;
  gramWeightMinGsm?: number;
  gramWeightMaxGsm?: number;
  burstIndex?: number;
  ringCrushIndex?: number;
  rawLabel: string;
  scope: "paper_kind_standard";
}

export interface NormalizedQualityStandardImportRow {
  sheetName: string;
  rowNumber: number;
  rawData: Record<string, string>;
  normalizedData: QualityStandardNormalizedData;
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

interface PaperPriceHeader {
  sheetName: string;
  rowNumber: number;
  columns: {
    supplierShortName: number;
    paperName: number;
    prices: Array<{
      header: string;
      columnNumber: number;
      effectiveDate?: string;
    }>;
  };
}

interface QualityStandardHeader {
  sheetName: string;
  rowNumber: number;
  columns: {
    metric: number;
    unit: number;
    grade: number;
    gramWeightMinGsm?: number;
    gramWeightMaxGsm?: number;
    standardValue: number;
  };
}

interface ParsedPaperCodeWorkbook {
  header: PaperCodeHeader;
  rows: NormalizedPaperCodeImportRow[];
}

interface ParsedPaperPriceWorkbook {
  header: PaperPriceHeader;
  rows: NormalizedPaperPriceImportRow[];
}

interface ParsedQualityStandardWorkbook {
  header: QualityStandardHeader;
  rows: NormalizedQualityStandardImportRow[];
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

type ParsePaperPriceWorkbookResult =
  | { ok: true; data: ParsedPaperPriceWorkbook }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
      };
    };

type ParseQualityStandardWorkbookResult =
  | { ok: true; data: ParsedQualityStandardWorkbook }
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

const PAPER_PRICE_SUPPLIER_LABELS = ["供应商", "原纸供应商", "原纸供应商简称"] as const;
const PAPER_PRICE_NAME_LABELS = ["原纸品种", "原纸名称", "品名"] as const;
const QUALITY_STANDARD_METRIC_LABELS = ["物理指标", "指标", "项目"] as const;
const QUALITY_STANDARD_UNIT_LABELS = ["单位"] as const;
const QUALITY_STANDARD_GRADE_LABELS = ["等级", "纸板等级"] as const;
const QUALITY_STANDARD_VALUE_LABELS = ["标准值", "指标值", "数值"] as const;
const QUALITY_STANDARD_GRAM_WEIGHT_MIN_LABELS = ["克重下限", "定量下限"] as const;
const QUALITY_STANDARD_GRAM_WEIGHT_MAX_LABELS = ["克重上限", "定量上限"] as const;

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

export async function parsePaperCodeCsv(csvText: string): Promise<ParsePaperCodeWorkbookResult> {
  const parseResult = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });
  const rows = parseResult.data;
  const header = findPaperCodeCsvHeader(rows);

  if (!header) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "未识别到原纸代码表头",
      },
    };
  }

  return {
    ok: true,
    data: {
      header,
      rows: readPaperCodeCsvRows(rows, header),
    },
  };
}

export async function parsePaperPriceWorkbook(
  workbookBuffer: Buffer,
): Promise<ParsePaperPriceWorkbookResult> {
  const workbook = new Workbook();
  await workbook.xlsx.load(workbookBuffer as unknown as ArrayBuffer);

  let firstHeader: PaperPriceHeader | undefined;
  const rows: NormalizedPaperPriceImportRow[] = [];

  for (const worksheet of workbook.worksheets) {
    const header = findPaperPriceHeader(worksheet);

    if (!header) {
      continue;
    }

    firstHeader ??= header;
    rows.push(...readPaperPriceRows(worksheet, header));
  }

  if (!firstHeader) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "未识别到纸价表头或纸价列",
      },
    };
  }

  return {
    ok: true,
    data: {
      header: firstHeader,
      rows,
    },
  };
}

export async function parseQualityStandardWorkbook(
  workbookBuffer: Buffer,
): Promise<ParseQualityStandardWorkbookResult> {
  const workbook = new Workbook();
  await workbook.xlsx.load(workbookBuffer as unknown as ArrayBuffer);

  let firstHeader: QualityStandardHeader | undefined;
  const rows: NormalizedQualityStandardImportRow[] = [];

  for (const worksheet of workbook.worksheets) {
    const header = findQualityStandardHeader(worksheet);

    if (!header) {
      continue;
    }

    firstHeader ??= header;
    rows.push(...readQualityStandardRows(worksheet, header));
  }

  if (!firstHeader) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "未识别到物理指标/标准表头",
      },
    };
  }

  return {
    ok: true,
    data: {
      header: firstHeader,
      rows,
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

function findPaperCodeCsvHeader(rows: string[][]): PaperCodeHeader | undefined {
  const maxRow = Math.min(rows.length, HEADER_SCAN_ROW_LIMIT);

  for (let rowIndex = 0; rowIndex < maxRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const columns = new Map<string, number>();
    const maxColumn = Math.min(row.length, HEADER_SCAN_COLUMN_LIMIT);

    for (let columnIndex = 0; columnIndex < maxColumn; columnIndex += 1) {
      const text = normalizeHeaderText(row[columnIndex] ?? "");

      if (text) {
        columns.set(text, columnIndex + 1);
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
        sheetName: "CSV",
        rowNumber: rowIndex + 1,
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

function findPaperPriceHeader(
  worksheet: Workbook["worksheets"][number],
): PaperPriceHeader | undefined {
  const maxRow = Math.min(worksheet.rowCount, HEADER_SCAN_ROW_LIMIT);

  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const columns = new Map<string, number>();
    const priceColumns: PaperPriceHeader["columns"]["prices"] = [];

    for (let columnNumber = 1; columnNumber <= HEADER_SCAN_COLUMN_LIMIT; columnNumber += 1) {
      const rawHeader = getCellText(row.getCell(columnNumber).value);
      const text = normalizeHeaderText(rawHeader);

      if (!text) {
        continue;
      }

      columns.set(text, columnNumber);

      if (isPaperPriceHeaderText(text)) {
        const effectiveDate = parsePriceHeaderEffectiveDate(rawHeader);

        priceColumns.push({
          header: rawHeader,
          columnNumber,
          ...(effectiveDate !== undefined ? { effectiveDate } : {}),
        });
      }
    }

    const supplierShortName = getFirstMatchingColumn(columns, PAPER_PRICE_SUPPLIER_LABELS);
    const paperName = getFirstMatchingColumn(columns, PAPER_PRICE_NAME_LABELS);

    if (supplierShortName && paperName && priceColumns.length > 0) {
      return {
        sheetName: worksheet.name,
        rowNumber,
        columns: {
          supplierShortName,
          paperName,
          prices: priceColumns,
        },
      };
    }
  }

  return undefined;
}

function findQualityStandardHeader(
  worksheet: Workbook["worksheets"][number],
): QualityStandardHeader | undefined {
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

    const metric = getFirstMatchingColumn(columns, QUALITY_STANDARD_METRIC_LABELS);
    const unit = getFirstMatchingColumn(columns, QUALITY_STANDARD_UNIT_LABELS);
    const grade = getFirstMatchingColumn(columns, QUALITY_STANDARD_GRADE_LABELS);
    const standardValue = getFirstMatchingColumn(columns, QUALITY_STANDARD_VALUE_LABELS);
    const gramWeightMinGsm = getFirstMatchingColumn(
      columns,
      QUALITY_STANDARD_GRAM_WEIGHT_MIN_LABELS,
    );
    const gramWeightMaxGsm = getFirstMatchingColumn(
      columns,
      QUALITY_STANDARD_GRAM_WEIGHT_MAX_LABELS,
    );

    if (metric && unit && grade && standardValue) {
      return {
        sheetName: worksheet.name,
        rowNumber,
        columns: {
          metric,
          unit,
          grade,
          standardValue,
          ...(gramWeightMinGsm !== undefined ? { gramWeightMinGsm } : {}),
          ...(gramWeightMaxGsm !== undefined ? { gramWeightMaxGsm } : {}),
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

function readPaperPriceRows(
  worksheet: Workbook["worksheets"][number],
  header: PaperPriceHeader,
): NormalizedPaperPriceImportRow[] {
  const rows: NormalizedPaperPriceImportRow[] = [];
  let lastSupplierShortName = "";

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const supplierCellText = getCellText(row.getCell(header.columns.supplierShortName).value);
    const supplierShortName = supplierCellText || lastSupplierShortName;
    const paperName = getCellText(row.getCell(header.columns.paperName).value);
    const rawData: Record<string, string> = {
      供应商: supplierCellText,
      原纸品种: paperName,
    };

    for (const priceColumn of header.columns.prices) {
      rawData[priceColumn.header] = getCellText(row.getCell(priceColumn.columnNumber).value);
    }

    if (Object.values(rawData).every((value) => value === "")) {
      continue;
    }

    if (supplierCellText) {
      lastSupplierShortName = supplierCellText;
    }

    rows.push({
      sheetName: worksheet.name,
      rowNumber,
      rawData,
      normalizedData: normalizePaperPriceRow({
        supplierShortName,
        paperName,
        priceColumns: header.columns.prices,
        rawData,
      }),
      errors: getPaperPriceRowParseErrors(rawData, header.columns.prices),
    });
  }

  return rows;
}

function readPaperCodeCsvRows(
  csvRows: string[][],
  header: PaperCodeHeader,
): NormalizedPaperCodeImportRow[] {
  const rows: NormalizedPaperCodeImportRow[] = [];

  for (let rowIndex = header.rowNumber; rowIndex < csvRows.length; rowIndex += 1) {
    const row = csvRows[rowIndex] ?? [];
    const rawData = {
      原纸代码: getCsvCellText(row, header.columns.paperCode),
      原纸编码: getCsvCellText(row, header.columns.paperEncoding),
      克重: getCsvCellText(row, header.columns.gramWeightGsm),
      原纸供应商简称: getCsvCellText(row, header.columns.supplierShortName),
      原纸名称: getCsvCellText(row, header.columns.paperName),
    };

    if (Object.values(rawData).every((value) => value === "")) {
      continue;
    }

    rows.push({
      sheetName: "CSV",
      rowNumber: rowIndex + 1,
      rawData,
      normalizedData: normalizePaperCodeRow(rawData),
      errors: getPaperCodeRowParseErrors(rawData),
    });
  }

  return rows;
}

function readQualityStandardRows(
  worksheet: Workbook["worksheets"][number],
  header: QualityStandardHeader,
): NormalizedQualityStandardImportRow[] {
  const rows: NormalizedQualityStandardImportRow[] = [];

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawData = {
      物理指标: getCellText(row.getCell(header.columns.metric).value),
      单位: getCellText(row.getCell(header.columns.unit).value),
      等级: getCellText(row.getCell(header.columns.grade).value),
      克重下限:
        header.columns.gramWeightMinGsm !== undefined
          ? getCellText(row.getCell(header.columns.gramWeightMinGsm).value)
          : "",
      克重上限:
        header.columns.gramWeightMaxGsm !== undefined
          ? getCellText(row.getCell(header.columns.gramWeightMaxGsm).value)
          : "",
      标准值: getCellText(row.getCell(header.columns.standardValue).value),
    };

    if (Object.values(rawData).every((value) => value === "")) {
      continue;
    }

    if (!isQualityMetric(rawData.物理指标)) {
      continue;
    }

    rows.push({
      sheetName: worksheet.name,
      rowNumber,
      rawData,
      normalizedData: normalizeQualityStandardRow(worksheet.name, rawData),
      errors: getQualityStandardRowParseErrors(rawData),
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

function normalizePaperPriceRow({
  supplierShortName,
  paperName,
  priceColumns,
  rawData,
}: {
  supplierShortName: string;
  paperName: string;
  priceColumns: PaperPriceHeader["columns"]["prices"];
  rawData: Record<string, string>;
}): PaperPriceNormalizedData {
  return {
    supplierShortName: supplierShortName.trim(),
    paperName: paperName.trim(),
    prices: priceColumns.flatMap((priceColumn) => {
      const priceText = rawData[priceColumn.header]?.trim() ?? "";

      if (priceText === "") {
        return [];
      }

      const priceYuanPerTon = parseImportedNumber(priceText);

      if (priceYuanPerTon === undefined) {
        return [];
      }

      return [
        {
          header: priceColumn.header,
          ...(priceColumn.effectiveDate !== undefined
            ? { effectiveDate: priceColumn.effectiveDate }
            : {}),
          priceYuanPerTon,
        },
      ];
    }),
  };
}

function normalizeQualityStandardRow(
  sheetName: string,
  rawData: Record<string, string>,
): QualityStandardNormalizedData {
  const normalized: QualityStandardNormalizedData = {
    paperKind: getQualityStandardPaperKind(sheetName),
    rawLabel: rawData["物理指标"]?.trim() ?? "",
    scope: "paper_kind_standard",
  };
  const grade = rawData["等级"]?.trim() ?? "";
  const gramWeightMinGsm = parseImportedNumber(rawData["克重下限"] ?? "");
  const gramWeightMaxGsm = parseImportedNumber(rawData["克重上限"] ?? "");
  const standardValue = parseImportedNumber(rawData["标准值"] ?? "");
  const metric = rawData["物理指标"] ?? "";

  if (grade) {
    normalized.grade = grade;
  }

  if (gramWeightMinGsm !== undefined) {
    normalized.gramWeightMinGsm = gramWeightMinGsm;
  }

  if (gramWeightMaxGsm !== undefined) {
    normalized.gramWeightMaxGsm = gramWeightMaxGsm;
  }

  if (standardValue !== undefined && isBurstIndexMetric(metric)) {
    normalized.burstIndex = standardValue;
  }

  if (standardValue !== undefined && isRingCrushIndexMetric(metric)) {
    normalized.ringCrushIndex = standardValue;
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

function getQualityStandardRowParseErrors(rawData: Record<string, string>): ImportFieldIssue[] {
  const errors: ImportFieldIssue[] = [];
  const standardValueText = rawData["标准值"]?.trim() ?? "";
  const gramWeightMinText = rawData["克重下限"]?.trim() ?? "";
  const gramWeightMaxText = rawData["克重上限"]?.trim() ?? "";

  if (standardValueText !== "" && parseImportedNumber(standardValueText) === undefined) {
    const metric = rawData["物理指标"] ?? "";

    errors.push({
      field: isRingCrushIndexMetric(metric) ? "ringCrushIndex" : "burstIndex",
      message: `${metric}不是有效数值`,
    });
  }

  if (gramWeightMinText !== "" && parseImportedNumber(gramWeightMinText) === undefined) {
    errors.push({
      field: "gramWeightMinGsm",
      message: "克重下限不是有效数值",
    });
  }

  if (gramWeightMaxText !== "" && parseImportedNumber(gramWeightMaxText) === undefined) {
    errors.push({
      field: "gramWeightMaxGsm",
      message: "克重上限不是有效数值",
    });
  }

  return errors;
}

function getPaperPriceRowParseErrors(
  rawData: Record<string, string>,
  priceColumns: PaperPriceHeader["columns"]["prices"],
): ImportFieldIssue[] {
  return priceColumns.flatMap((priceColumn) => {
    const priceText = rawData[priceColumn.header]?.trim() ?? "";

    if (priceText === "" || parseImportedNumber(priceText) !== undefined) {
      return [];
    }

    return [
      {
        field: "priceYuanPerTon",
        message: `${priceColumn.header}不是有效纸价`,
      },
    ];
  });
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

function isPaperPriceHeaderText(value: string): boolean {
  return value.includes("纸价") && !value.includes("无纸价");
}

function parsePriceHeaderEffectiveDate(header: string): string | undefined {
  const match = header.match(/(?<month>\d{1,2})\.(?<day>\d{1,2})/u);
  const month = match?.groups?.month;
  const day = match?.groups?.day;

  if (!month || !day) {
    return undefined;
  }

  return `${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseImportedNumber(value: string): number | undefined {
  const normalizedValue = value.replace(/,/g, "").trim();
  const numberValue = Number(normalizedValue);

  return normalizedValue !== "" && Number.isFinite(numberValue) ? numberValue : undefined;
}

function getQualityStandardPaperKind(sheetName: string): QualityStandardPaperKind {
  if (sheetName.includes("瓦纸")) {
    return "corrugating";
  }

  if (sheetName.includes("箱板纸")) {
    return "linerboard";
  }

  return "unknown";
}

function isQualityMetric(value: string): boolean {
  return isBurstIndexMetric(value) || isRingCrushIndexMetric(value);
}

function isBurstIndexMetric(value: string): boolean {
  return normalizeHeaderText(value).includes("耐破");
}

function isRingCrushIndexMetric(value: string): boolean {
  return normalizeHeaderText(value).includes("环压");
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

function getCsvCellText(row: string[], oneBasedColumnNumber: number): string {
  return (row[oneBasedColumnNumber - 1] ?? "").trim();
}
