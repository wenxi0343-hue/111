import type {
  ImportFieldIssue,
  NormalizedPaperCodeImportRow as ParsedPaperCodeImportRow,
  NormalizedPaperPriceImportRow as ParsedPaperPriceImportRow,
  NormalizedQualityStandardImportRow as ParsedQualityStandardImportRow,
  QualityStandardNormalizedData,
} from "@/modules/import-export/master-data-workbook-parser";
import {
  calculatePaperMaterialCompleteness,
  type PaperMaterialCompletenessStatus,
} from "@/modules/master-data/completeness";
import {
  buildPaperPriceSourceSignature,
  matchPaperPriceImportRow,
  type ExistingPaperMaterialForPriceMatch,
  type PaperMaterialMatchRule,
} from "@/modules/master-data/match-import-row";

export type NormalizedPaperCodeImportRow = ParsedPaperCodeImportRow;
export type NormalizedPaperPriceImportRow = ParsedPaperPriceImportRow;
export type NormalizedQualityStandardImportRow = ParsedQualityStandardImportRow;

export type PaperCodeImportRowStatus = "new" | "update" | "failed";
export type PaperPriceImportRowStatus = "update" | "pending" | "failed";
export type QualityStandardImportRowStatus = "update" | "standard_rule" | "failed";

export interface ExistingPaperMaterialForPreview {
  id: string;
  paperCode: string;
}

export interface ExistingPaperMaterialForPricePreview
  extends ExistingPaperMaterialForPriceMatch {
  priceYuanPerTon?: number | undefined;
}

export interface ExistingPaperMaterialForQualityStandardPreview {
  id: string;
  paperCode: string;
  factoryName?: string | undefined;
  name: string;
  paperKind: string;
  grade?: string | undefined;
  gramWeightGsm: number;
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
}

export interface PaperCodeImportPreviewInput {
  rows: NormalizedPaperCodeImportRow[];
  existingMaterials: ExistingPaperMaterialForPreview[];
}

export interface PaperPriceImportPreviewInput {
  rows: NormalizedPaperPriceImportRow[];
  existingMaterials: ExistingPaperMaterialForPricePreview[];
  confirmedMatchRules: PaperMaterialMatchRule[];
}

export interface QualityStandardImportPreviewInput {
  rows: NormalizedQualityStandardImportRow[];
  existingMaterials: ExistingPaperMaterialForQualityStandardPreview[];
}

export interface PaperCodeImportPreviewRow extends NormalizedPaperCodeImportRow {
  rowStatus: PaperCodeImportRowStatus;
  factoryName?: string | undefined;
  targetMaterialId?: string | undefined;
  completenessStatus: PaperMaterialCompletenessStatus;
  missingFields: string[];
  warnings: ImportFieldIssue[];
}

export interface PaperPriceImportPreviewRow extends NormalizedPaperPriceImportRow {
  rowStatus: PaperPriceImportRowStatus;
  sourceSignature: string;
  targetMaterialId?: string | undefined;
  candidateMaterialIds: string[];
  changeSet: Record<string, { before: unknown; after: unknown }>;
}

export interface QualityStandardRulePreview {
  paperKind: QualityStandardNormalizedData["paperKind"];
  grade?: string | undefined;
  gramWeightMinGsm?: number | undefined;
  gramWeightMaxGsm?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  rawLabel: string;
}

export interface QualityStandardImportPreviewRow {
  sheetName: string;
  rowNumber: number;
  sourceRowNumbers: number[];
  rawData: Record<string, string>;
  normalizedData: QualityStandardNormalizedData;
  rowStatus: QualityStandardImportRowStatus;
  targetMaterialId?: string | undefined;
  candidateMaterialIds: string[];
  standardRule?: QualityStandardRulePreview | undefined;
  notice?: string | undefined;
  changeSet: Record<string, { before: unknown; after: unknown }>;
  completenessStatus?: PaperMaterialCompletenessStatus | undefined;
  missingFields: string[];
  errors: ImportFieldIssue[];
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

export interface PaperPriceImportPreview {
  summary: {
    newCount: number;
    updateCount: number;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  };
  rows: PaperPriceImportPreviewRow[];
}

export interface QualityStandardImportPreview {
  summary: {
    newCount: number;
    updateCount: number;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  };
  rows: QualityStandardImportPreviewRow[];
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

export function createPaperPriceImportPreview(
  input: PaperPriceImportPreviewInput,
): PaperPriceImportPreview {
  const rows = input.rows.map<PaperPriceImportPreviewRow>((row) => {
    const sourceSignature = buildPaperPriceSourceSignature(row.normalizedData);

    if (row.errors.length > 0) {
      return {
        ...row,
        rowStatus: "failed",
        sourceSignature,
        candidateMaterialIds: [],
        changeSet: {},
      };
    }

    const latestPrice = getLatestPaperPrice(row);

    if (!latestPrice) {
      return {
        ...row,
        rowStatus: "failed",
        sourceSignature,
        candidateMaterialIds: [],
        changeSet: {},
        errors: [{ field: "priceYuanPerTon", message: "缺少有效纸价" }],
      };
    }

    const matchResult = matchPaperPriceImportRow({
      normalizedData: row.normalizedData,
      existingMaterials: input.existingMaterials,
      confirmedMatchRules: input.confirmedMatchRules,
    });

    if (matchResult.kind === "matched") {
      return {
        ...row,
        rowStatus: "update",
        sourceSignature,
        targetMaterialId: matchResult.material.id,
        candidateMaterialIds: [],
        changeSet: buildPaperPriceChangeSet(matchResult.material.priceYuanPerTon, latestPrice),
      };
    }

    if (matchResult.kind === "pending") {
      return {
        ...row,
        rowStatus: "pending",
        sourceSignature,
        candidateMaterialIds: matchResult.candidates.map((candidate) => candidate.id),
        changeSet: {},
        errors: [{ field: "paperMaterialId", message: matchResult.reason }],
      };
    }

    return {
      ...row,
      rowStatus: "failed",
      sourceSignature,
      candidateMaterialIds: [],
      changeSet: {},
      errors: [{ field: "paperMaterialId", message: matchResult.reason }],
    };
  });

  return {
    summary: summarizePaperPricePreviewRows(rows),
    rows,
  };
}

export function createQualityStandardImportPreview(
  input: QualityStandardImportPreviewInput,
): QualityStandardImportPreview {
  const rows = groupQualityStandardRows(input.rows).map<QualityStandardImportPreviewRow>(
    (group) => {
      if (group.errors.length > 0) {
        return buildFailedQualityStandardPreviewRow(group);
      }

      const standardRule = buildQualityStandardRulePreview(group.normalizedData);
      const matchedMaterials = findQualityStandardMatchedMaterials(
        group.normalizedData,
        input.existingMaterials,
      );

      if (matchedMaterials.length !== 1) {
        return {
          ...buildBaseQualityStandardPreviewRow(group),
          rowStatus: "standard_rule",
          candidateMaterialIds: matchedMaterials.map((material) => material.id),
          standardRule,
          notice: "将写入纸类标准规则，不覆盖具体原纸",
          changeSet: {},
          missingFields: [],
        };
      }

      const [material] = matchedMaterials;

      if (!material) {
        return {
          ...buildBaseQualityStandardPreviewRow(group),
          rowStatus: "standard_rule",
          candidateMaterialIds: [],
          standardRule,
          notice: "将写入纸类标准规则，不覆盖具体原纸",
          changeSet: {},
          missingFields: [],
        };
      }

      const afterMaterial = applyQualityStandardToMaterial(material, group.normalizedData);
      const completeness = calculatePaperMaterialCompleteness({
        paperCode: afterMaterial.paperCode,
        factoryName: afterMaterial.factoryName,
        paperName: afterMaterial.name,
        gramWeightGsm: afterMaterial.gramWeightGsm,
        paperKind: afterMaterial.paperKind,
        priceYuanPerTon: afterMaterial.priceYuanPerTon,
        burstIndex: afterMaterial.burstIndex,
        ringCrushIndex: afterMaterial.ringCrushIndex,
      });

      return {
        ...buildBaseQualityStandardPreviewRow(group),
        rowStatus: "update",
        targetMaterialId: material.id,
        candidateMaterialIds: [],
        standardRule,
        changeSet: buildQualityStandardChangeSet(material, afterMaterial),
        completenessStatus: completeness.status,
        missingFields: completeness.missingFields,
      };
    },
  );

  return {
    summary: summarizeQualityStandardPreviewRows(rows),
    rows,
  };
}

export { buildPaperPriceSourceSignature };

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

function summarizePaperPricePreviewRows(
  rows: PaperPriceImportPreviewRow[],
): PaperPriceImportPreview["summary"] {
  return rows.reduce<PaperPriceImportPreview["summary"]>(
    (summary, row) => ({
      newCount: summary.newCount,
      updateCount: summary.updateCount + (row.rowStatus === "update" ? 1 : 0),
      pendingCount: summary.pendingCount + (row.rowStatus === "pending" ? 1 : 0),
      failedCount: summary.failedCount + (row.rowStatus === "failed" ? 1 : 0),
      incompleteCount: summary.incompleteCount,
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

function summarizeQualityStandardPreviewRows(
  rows: QualityStandardImportPreviewRow[],
): QualityStandardImportPreview["summary"] {
  return rows.reduce<QualityStandardImportPreview["summary"]>(
    (summary, row) => ({
      newCount: summary.newCount,
      updateCount: summary.updateCount + (row.rowStatus === "update" ? 1 : 0),
      pendingCount: summary.pendingCount + (row.rowStatus === "standard_rule" ? 1 : 0),
      failedCount: summary.failedCount + (row.rowStatus === "failed" ? 1 : 0),
      incompleteCount:
        summary.incompleteCount + (row.completenessStatus === "incomplete" ? 1 : 0),
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

interface QualityStandardRowGroup {
  sheetName: string;
  rowNumber: number;
  sourceRowNumbers: number[];
  rawData: Record<string, string>;
  normalizedData: QualityStandardNormalizedData;
  errors: ImportFieldIssue[];
}

function groupQualityStandardRows(
  rows: NormalizedQualityStandardImportRow[],
): QualityStandardRowGroup[] {
  const groupsByKey = new Map<string, QualityStandardRowGroup>();

  for (const row of rows) {
    const key = buildQualityStandardGroupKey(row.normalizedData);
    const existingGroup = groupsByKey.get(key);

    if (!existingGroup) {
      groupsByKey.set(key, {
        sheetName: row.sheetName,
        rowNumber: row.rowNumber,
        sourceRowNumbers: [row.rowNumber],
        rawData: row.rawData,
        normalizedData: { ...row.normalizedData },
        errors: [...row.errors],
      });
      continue;
    }

    existingGroup.sourceRowNumbers.push(row.rowNumber);
    existingGroup.errors.push(...row.errors);
    existingGroup.normalizedData = mergeQualityStandardNormalizedData(
      existingGroup.normalizedData,
      row.normalizedData,
    );
  }

  return [...groupsByKey.values()];
}

function buildQualityStandardGroupKey(normalizedData: QualityStandardNormalizedData): string {
  return [
    normalizedData.paperKind,
    normalizedData.grade ?? "",
    normalizedData.gramWeightMinGsm?.toString() ?? "",
    normalizedData.gramWeightMaxGsm?.toString() ?? "",
  ].join("|");
}

function mergeQualityStandardNormalizedData(
  left: QualityStandardNormalizedData,
  right: QualityStandardNormalizedData,
): QualityStandardNormalizedData {
  return {
    ...left,
    rawLabel: [left.rawLabel, right.rawLabel].filter(Boolean).join(" / "),
    ...(right.burstIndex !== undefined ? { burstIndex: right.burstIndex } : {}),
    ...(right.ringCrushIndex !== undefined ? { ringCrushIndex: right.ringCrushIndex } : {}),
  };
}

function buildBaseQualityStandardPreviewRow(
  group: QualityStandardRowGroup,
): Omit<
  QualityStandardImportPreviewRow,
  | "rowStatus"
  | "targetMaterialId"
  | "candidateMaterialIds"
  | "standardRule"
  | "notice"
  | "changeSet"
  | "completenessStatus"
  | "missingFields"
> {
  return {
    sheetName: group.sheetName,
    rowNumber: group.rowNumber,
    sourceRowNumbers: group.sourceRowNumbers,
    rawData: group.rawData,
    normalizedData: group.normalizedData,
    errors: group.errors,
  };
}

function buildFailedQualityStandardPreviewRow(
  group: QualityStandardRowGroup,
): QualityStandardImportPreviewRow {
  return {
    ...buildBaseQualityStandardPreviewRow(group),
    rowStatus: "failed",
    candidateMaterialIds: [],
    changeSet: {},
    missingFields: [],
  };
}

function buildQualityStandardRulePreview(
  normalizedData: QualityStandardNormalizedData,
): QualityStandardRulePreview {
  return {
    paperKind: normalizedData.paperKind,
    rawLabel: normalizedData.rawLabel,
    ...(normalizedData.grade !== undefined ? { grade: normalizedData.grade } : {}),
    ...(normalizedData.gramWeightMinGsm !== undefined
      ? { gramWeightMinGsm: normalizedData.gramWeightMinGsm }
      : {}),
    ...(normalizedData.gramWeightMaxGsm !== undefined
      ? { gramWeightMaxGsm: normalizedData.gramWeightMaxGsm }
      : {}),
    ...(normalizedData.burstIndex !== undefined ? { burstIndex: normalizedData.burstIndex } : {}),
    ...(normalizedData.ringCrushIndex !== undefined
      ? { ringCrushIndex: normalizedData.ringCrushIndex }
      : {}),
  };
}

function findQualityStandardMatchedMaterials(
  normalizedData: QualityStandardNormalizedData,
  materials: ExistingPaperMaterialForQualityStandardPreview[],
): ExistingPaperMaterialForQualityStandardPreview[] {
  if (normalizedData.paperKind === "unknown") {
    return [];
  }

  return materials.filter((material) => isQualityStandardMatchingMaterial(normalizedData, material));
}

function isQualityStandardMatchingMaterial(
  normalizedData: QualityStandardNormalizedData,
  material: ExistingPaperMaterialForQualityStandardPreview,
): boolean {
  const paperKindMatches =
    material.paperKind === normalizedData.paperKind || material.paperKind === "unknown";

  if (!paperKindMatches) {
    return false;
  }

  if (normalizedData.grade && material.grade !== normalizedData.grade) {
    return false;
  }

  if (
    normalizedData.gramWeightMinGsm !== undefined &&
    material.gramWeightGsm < normalizedData.gramWeightMinGsm
  ) {
    return false;
  }

  if (
    normalizedData.gramWeightMaxGsm !== undefined &&
    material.gramWeightGsm > normalizedData.gramWeightMaxGsm
  ) {
    return false;
  }

  return true;
}

function applyQualityStandardToMaterial(
  material: ExistingPaperMaterialForQualityStandardPreview,
  normalizedData: QualityStandardNormalizedData,
): ExistingPaperMaterialForQualityStandardPreview {
  return {
    ...material,
    paperKind: normalizedData.paperKind,
    ...(normalizedData.grade !== undefined ? { grade: normalizedData.grade } : {}),
    ...(normalizedData.burstIndex !== undefined ? { burstIndex: normalizedData.burstIndex } : {}),
    ...(normalizedData.ringCrushIndex !== undefined
      ? { ringCrushIndex: normalizedData.ringCrushIndex }
      : {}),
  };
}

function buildQualityStandardChangeSet(
  before: ExistingPaperMaterialForQualityStandardPreview,
  after: ExistingPaperMaterialForQualityStandardPreview,
): QualityStandardImportPreviewRow["changeSet"] {
  const changeSet: QualityStandardImportPreviewRow["changeSet"] = {};

  addQualityStandardChangedField(changeSet, "paper_kind", before.paperKind, after.paperKind);
  addQualityStandardChangedField(changeSet, "grade", before.grade ?? null, after.grade ?? null);
  addQualityStandardChangedField(
    changeSet,
    "burst_index",
    before.burstIndex ?? null,
    after.burstIndex ?? null,
  );
  addQualityStandardChangedField(
    changeSet,
    "ring_crush_index",
    before.ringCrushIndex ?? null,
    after.ringCrushIndex ?? null,
  );

  return changeSet;
}

function addQualityStandardChangedField(
  changeSet: QualityStandardImportPreviewRow["changeSet"],
  field: string,
  before: unknown,
  after: unknown,
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

  changeSet[field] = { before, after };
}

function getLatestPaperPrice(
  row: NormalizedPaperPriceImportRow,
): NormalizedPaperPriceImportRow["normalizedData"]["prices"][number] | undefined {
  return [...row.normalizedData.prices].sort(comparePaperPriceByEffectiveDate).at(-1);
}

function comparePaperPriceByEffectiveDate(
  left: NormalizedPaperPriceImportRow["normalizedData"]["prices"][number],
  right: NormalizedPaperPriceImportRow["normalizedData"]["prices"][number],
): number {
  return getPaperPriceEffectiveDateSortValue(left.effectiveDate) -
    getPaperPriceEffectiveDateSortValue(right.effectiveDate);
}

function getPaperPriceEffectiveDateSortValue(effectiveDate: string | undefined): number {
  if (!effectiveDate) {
    return 0;
  }

  return Number(effectiveDate.replace("-", ""));
}

function buildPaperPriceChangeSet(
  before: number | undefined,
  price: NormalizedPaperPriceImportRow["normalizedData"]["prices"][number],
): PaperPriceImportPreviewRow["changeSet"] {
  if (before === price.priceYuanPerTon) {
    return {};
  }

  return {
    price_yuan_per_ton: {
      before: before ?? null,
      after: price.priceYuanPerTon,
    },
  };
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
