import type {
  ImportFieldIssue,
  NormalizedPaperCodeImportRow as ParsedPaperCodeImportRow,
} from "@/modules/import-export/master-data-workbook-parser";
import {
  calculatePaperMaterialCompleteness,
  type PaperMaterialCompletenessStatus,
} from "@/modules/master-data/completeness";

export type NormalizedPaperCodeImportRow = ParsedPaperCodeImportRow;

export type PaperCodeImportRowStatus = "new" | "update" | "failed";

export interface ExistingPaperMaterialForPreview {
  id: string;
  paperCode: string;
}

export interface PaperCodeImportPreviewInput {
  rows: NormalizedPaperCodeImportRow[];
  existingMaterials: ExistingPaperMaterialForPreview[];
}

export interface PaperCodeImportPreviewRow extends NormalizedPaperCodeImportRow {
  rowStatus: PaperCodeImportRowStatus;
  factoryName?: string | undefined;
  targetMaterialId?: string | undefined;
  completenessStatus: PaperMaterialCompletenessStatus;
  missingFields: string[];
  warnings: ImportFieldIssue[];
}

export interface PaperCodeImportPreview {
  summary: {
    newCount: number;
    updateCount: number;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  };
  rows: PaperCodeImportPreviewRow[];
}

const REQUIRED_FIELD_ERRORS: Array<{
  field: keyof NormalizedPaperCodeImportRow["normalizedData"];
  message: string;
}> = [
  { field: "paperCode", message: "缺少原纸代码" },
  { field: "gramWeightGsm", message: "缺少克重" },
  { field: "supplierShortName", message: "缺少原纸供应商简称" },
  { field: "paperName", message: "缺少原纸名称" },
];

export function createPaperCodeImportPreview(
  input: PaperCodeImportPreviewInput,
): PaperCodeImportPreview {
  const duplicatePaperCodes = findDuplicatePaperCodes(input.rows);
  const duplicatePaperEncodings = findDuplicatePaperEncodings(input.rows);
  const existingMaterialsByCode = new Map(
    input.existingMaterials.map((material) => [material.paperCode, material]),
  );

  const rows = input.rows.map<PaperCodeImportPreviewRow>((row) => {
    const normalizedData = row.normalizedData;
    const errors = [
      ...row.errors,
      ...getRequiredFieldErrors(row),
      ...getDuplicatePaperCodeErrors(normalizedData.paperCode, duplicatePaperCodes),
    ];
    const warnings = getPaperEncodingWarnings(
      normalizedData.paperEncoding,
      duplicatePaperEncodings,
    );
    const completeness = calculatePaperMaterialCompleteness({
      paperCode: normalizedData.paperCode,
      factoryName: normalizedData.supplierShortName,
      paperName: normalizedData.paperName,
      gramWeightGsm: normalizedData.gramWeightGsm,
      paperKind: "unknown",
    });
    const existingMaterial = normalizedData.paperCode
      ? existingMaterialsByCode.get(normalizedData.paperCode)
      : undefined;

    return {
      ...row,
      errors,
      rowStatus: errors.length > 0 ? "failed" : existingMaterial ? "update" : "new",
      factoryName: normalizedData.supplierShortName,
      targetMaterialId: existingMaterial?.id,
      completenessStatus: completeness.status,
      missingFields: completeness.missingFields,
      warnings,
    };
  });

  return {
    summary: summarizePaperCodePreviewRows(rows),
    rows,
  };
}

function summarizePaperCodePreviewRows(
  rows: PaperCodeImportPreviewRow[],
): PaperCodeImportPreview["summary"] {
  return rows.reduce<PaperCodeImportPreview["summary"]>(
    (summary, row) => ({
      newCount: summary.newCount + (row.rowStatus === "new" ? 1 : 0),
      updateCount: summary.updateCount + (row.rowStatus === "update" ? 1 : 0),
      pendingCount: summary.pendingCount,
      failedCount: summary.failedCount + (row.rowStatus === "failed" ? 1 : 0),
      incompleteCount: summary.incompleteCount + (row.completenessStatus === "incomplete" ? 1 : 0),
    }),
    {
      newCount: 0,
      updateCount: 0,
      pendingCount: 0,
      failedCount: 0,
      incompleteCount: 0,
    },
  );
}

function getRequiredFieldErrors(row: NormalizedPaperCodeImportRow): ImportFieldIssue[] {
  return REQUIRED_FIELD_ERRORS.flatMap((requiredField) => {
    const value = row.normalizedData[requiredField.field];

    if (value === "" || value === undefined) {
      return [{ field: requiredField.field, message: requiredField.message }];
    }

    return [];
  });
}

function getDuplicatePaperCodeErrors(
  paperCode: string | undefined,
  duplicatePaperCodes: Set<string>,
): ImportFieldIssue[] {
  if (!paperCode || !duplicatePaperCodes.has(paperCode)) {
    return [];
  }

  return [{ field: "paperCode", message: `原纸代码重复：${paperCode}` }];
}

function getPaperEncodingWarnings(
  paperEncoding: string | undefined,
  duplicatePaperEncodings: Set<string>,
): ImportFieldIssue[] {
  if (!paperEncoding || !duplicatePaperEncodings.has(paperEncoding)) {
    return [];
  }

  return [{ field: "paperEncoding", message: "原纸编码仅作辅助关联字段，可重复" }];
}

function findDuplicatePaperCodes(rows: NormalizedPaperCodeImportRow[]): Set<string> {
  return findDuplicateNormalizedValues(rows, (row) => row.normalizedData.paperCode);
}

function findDuplicatePaperEncodings(rows: NormalizedPaperCodeImportRow[]): Set<string> {
  return findDuplicateNormalizedValues(rows, (row) => row.normalizedData.paperEncoding);
}

function findDuplicateNormalizedValues(
  rows: NormalizedPaperCodeImportRow[],
  selectValue: (row: NormalizedPaperCodeImportRow) => string | undefined,
): Set<string> {
  const seenValues = new Set<string>();
  const duplicateValues = new Set<string>();

  for (const row of rows) {
    const value = selectValue(row);

    if (!value) {
      continue;
    }

    if (seenValues.has(value)) {
      duplicateValues.add(value);
    }

    seenValues.add(value);
  }

  return duplicateValues;
}
