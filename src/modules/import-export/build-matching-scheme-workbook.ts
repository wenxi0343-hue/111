import { Workbook } from "exceljs";

import {
  matchingSchemeExportTypeLabels,
  type MatchingSchemeExportRecord,
} from "@/modules/import-export/matching-scheme-export-types";
import type { MatchingSchemeHistoryRecord } from "@/server/actions/matching-scheme-history";

type SnapshotObject = Record<string, unknown>;

export interface MatchingSchemeWorkbook {
  fileName: string;
  buffer: Buffer;
}

const finalStatusLabels: Record<string, string> = {
  qualified: "达标",
  unqualified: "未达标",
  not_manufacturable: "不可生产",
  data_incomplete: "数据不足",
};

const roleLabels: Record<string, string> = {
  outer_liner: "面纸",
  inner_liner: "里纸",
  corrugating: "瓦纸",
  medium: "芯纸",
};

export async function buildMatchingSchemeWorkbook({
  record,
  exportedAt,
}: {
  record: MatchingSchemeHistoryRecord;
  exportedAt: Date;
}): Promise<MatchingSchemeWorkbook> {
  const workbook = new Workbook();
  workbook.creator = "纸箱自动配纸工具";
  workbook.created = exportedAt;
  workbook.modified = exportedAt;

  appendOverviewSheet(workbook, record);
  appendOriginalRecommendationsSheet(workbook, record);
  appendFinalSchemeSheet(workbook, record);
  appendExportRecordsSheet(workbook, record);

  const arrayBuffer = await workbook.xlsx.writeBuffer();

  return {
    fileName: `配纸方案-${record.id.slice(0, 8)}-${formatFileTimestamp(exportedAt)}.xlsx`,
    buffer: Buffer.from(arrayBuffer),
  };
}

function appendOverviewSheet(workbook: Workbook, record: MatchingSchemeHistoryRecord) {
  const sheet = workbook.addWorksheet("方案总览");
  const finalScheme = record.finalSchemeSnapshot;

  sheet.addRows([
    ["项目", "内容"],
    ["记录编号", record.id],
    ["保存时间", formatDateTime(record.createdAt)],
    ["纸箱尺寸", formatBoxSize(record.boxSpecSnapshot)],
    ["生产数量", formatNumber(record.boxSpecSnapshot.productionQuantity)],
    ["最终状态", getFinalStatusLabel(finalScheme)],
    ["基础参数版本", record.parameterVersion],
  ]);
}

function appendOriginalRecommendationsSheet(workbook: Workbook, record: MatchingSchemeHistoryRecord) {
  const sheet = workbook.addWorksheet("原始三套推荐");

  sheet.addRow([
    "推荐类型",
    "推荐状态",
    "层数",
    "瓦型",
    "纸张组合",
    "空箱抗压",
    "边压",
    "耐破",
    "选型理由",
  ]);

  for (const slotValue of record.originalRecommendationSlotsSnapshot) {
    const slot = toObject(slotValue);
    const evaluation = toObject(slot.evaluation);

    sheet.addRow([
      getString(slot.title, getString(slot.strategy, "推荐方案")),
      getString(slot.status, "-"),
      getLayerCountText(evaluation),
      getFluteText(evaluation),
      formatPaperLayers(evaluation),
      formatStrengthValue(evaluation, "bctN", "N"),
      formatStrengthValue(evaluation, "edgeCrushKnPerM", "kN/m", 2),
      formatStrengthValue(evaluation, "burstStrength", ""),
      getSelectionReasonText(slot.selectionReason),
    ]);
  }
}

function appendFinalSchemeSheet(workbook: Workbook, record: MatchingSchemeHistoryRecord) {
  const sheet = workbook.addWorksheet("最终确认方案");
  const finalScheme = record.finalSchemeSnapshot;

  sheet.addRows([
    ["项目", "内容"],
    ["层数", getLayerCountText(finalScheme)],
    ["瓦型", getFluteText(finalScheme)],
    ["纸张组合", formatPaperLayers(finalScheme)],
    ["空箱抗压", formatStrengthValue(finalScheme, "bctN", "N")],
    ["边压", formatStrengthValue(finalScheme, "edgeCrushKnPerM", "kN/m", 2)],
    ["耐破", formatStrengthValue(finalScheme, "burstStrength", "")],
    ["达标状态", getStrengthStatusLabel(finalScheme)],
    ["可生产状态", getManufacturableStatusLabel(finalScheme)],
    ["选型理由", getSelectionReasonText(finalScheme.selectionReason)],
  ]);
}

function appendExportRecordsSheet(workbook: Workbook, record: MatchingSchemeHistoryRecord) {
  const sheet = workbook.addWorksheet("导出记录");

  sheet.addRow(["导出类型", "导出时间"]);

  for (const exportRecord of record.exportRecords) {
    sheet.addRow([getExportRecordLabel(exportRecord), formatDateTime(new Date(exportRecord.exportedAt))]);
  }
}

function getFinalStatusLabel(snapshot: SnapshotObject): string {
  const finalStatus = getString(snapshot.finalStatus, "");

  return finalStatusLabels[finalStatus] || "未知";
}

function getStrengthStatusLabel(snapshot: SnapshotObject): string {
  const strength = toObject(snapshot.strength);

  if (strength.isQualified === false) {
    return "未达标";
  }

  return getFinalStatusLabel(snapshot);
}

function getManufacturableStatusLabel(snapshot: SnapshotObject): string {
  const device = toObject(snapshot.device);

  return device.isManufacturable === false ? "不可生产" : "可生产";
}

function getLayerCountText(snapshot: SnapshotObject): string {
  const candidate = toObject(snapshot.candidate);
  const layerCount = formatNumber(candidate.layerCount);

  return layerCount === "-" ? "-" : `${layerCount} 层`;
}

function getFluteText(snapshot: SnapshotObject): string {
  const candidate = toObject(snapshot.candidate);
  const flute = getString(candidate.fluteType, "-");

  return flute === "-" ? "-" : `${flute} 楞`;
}

function formatPaperLayers(snapshot: SnapshotObject): string {
  const candidate = toObject(snapshot.candidate);

  return toArray(candidate.layers)
    .map((layerValue) => {
      const layer = toObject(layerValue);
      const paper = toObject(layer.paper);
      const role = roleLabels[getString(layer.role, "")] || getString(layer.role, "-");

      return `${role}: ${getString(paper.paperCode, "-")} ${getString(paper.name, "-")} ${formatNumberWithUnit(
        paper.gramWeightGsm,
        "gsm",
      )}`;
    })
    .join("；");
}

function formatStrengthValue(
  snapshot: SnapshotObject,
  key: "bctN" | "edgeCrushKnPerM" | "burstStrength",
  unit: string,
  fractionDigits?: number,
): string {
  const strength = toObject(snapshot.strength);
  const formatted =
    fractionDigits === undefined
      ? formatNumber(strength[key])
      : formatDecimal(strength[key], fractionDigits);

  return formatted === "-" || !unit ? formatted : `${formatted} ${unit}`;
}

function formatBoxSize(snapshot: SnapshotObject): string {
  return `${formatNumber(snapshot.lengthMm)} x ${formatNumber(snapshot.widthMm)} x ${formatNumber(
    snapshot.heightMm,
  )} mm`;
}

function getExportRecordLabel(record: MatchingSchemeExportRecord): string {
  return matchingSchemeExportTypeLabels[record.type] ?? record.type;
}

function toObject(value: unknown): SnapshotObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SnapshotObject)
    : {};
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function getSelectionReasonText(value: unknown): string {
  const legacyText = getString(value, "");

  if (legacyText) {
    return legacyText;
  }

  const reason = toObject(value);
  const text = getString(reason.text, "");

  if (!text) {
    return "";
  }

  const sourceLabel = getString(reason.sourceLabel, "");

  return sourceLabel ? `${sourceLabel}：${text}` : text;
}

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function formatDecimal(value: unknown, fractionDigits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function formatNumberWithUnit(value: unknown, unit: string): string {
  const formatted = formatNumber(value);

  return formatted === "-" ? "-" : `${formatted}${unit}`;
}

function formatDateTime(date: Date): string {
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    " ",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
    ":",
    pad(date.getUTCSeconds()),
  ].join("");
}

function formatFileTimestamp(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join("");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
