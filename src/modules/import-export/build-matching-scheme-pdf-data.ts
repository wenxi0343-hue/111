import type {
  MatchingSchemePdfData,
  MatchingSchemePdfExportType,
  MatchingSchemePdfLabeledValue,
  MatchingSchemePdfPaperLayer,
  MatchingSchemePdfSchemeDetail,
  MatchingSchemePdfSchemeSummary,
} from "@/modules/import-export/matching-scheme-pdf-types";
import type { MatchingSchemeHistoryRecord } from "@/server/actions/matching-scheme-history";

type SnapshotObject = Record<string, unknown>;

interface BuildMatchingSchemePdfDataInput {
  record: MatchingSchemeHistoryRecord;
  type: MatchingSchemePdfExportType;
}

const finalStatusLabels: Record<string, string> = {
  qualified: "达标",
  unqualified: "未达标",
  not_manufacturable: "不可生产",
  data_incomplete: "数据不足",
};

const layerRoleLabels: Record<string, string> = {
  outer_liner: "面纸",
  inner_liner: "里纸",
  corrugating: "瓦纸",
  medium: "芯纸",
};

export function buildMatchingSchemePdfData({
  record,
  type,
}: BuildMatchingSchemePdfDataInput): MatchingSchemePdfData {
  const showCost = type === "full_report";
  const showOriginalRecommendations = type === "full_report";
  const finalScheme = toSchemeDetail(record.finalSchemeSnapshot, showCost);

  return {
    type,
    title: type === "full_report" ? "配纸方案报告" : "配纸方案表",
    fileName: createFileName(record.createdAt, type),
    schemeId: record.id,
    savedAt: record.createdAt,
    isManuallyAdjusted: record.isManuallyAdjusted,
    boxSpec: toBoxSpecRows(record.boxSpecSnapshot),
    originalRecommendations: showOriginalRecommendations
      ? record.originalRecommendationSlotsSnapshot.map(toRecommendationSummary)
      : [],
    finalScheme,
    recommendationConclusion: createRecommendationConclusion(record.finalSchemeSnapshot),
    exportVisibility: {
      showCost,
      showOriginalRecommendations,
    },
  };
}

function createFileName(savedAt: Date, type: MatchingSchemePdfExportType): string {
  const timestamp = [
    savedAt.getUTCFullYear(),
    pad(savedAt.getUTCMonth() + 1),
    pad(savedAt.getUTCDate()),
    "-",
    pad(savedAt.getUTCHours()),
    pad(savedAt.getUTCMinutes()),
    pad(savedAt.getUTCSeconds()),
  ].join("");
  const typeLabel = type === "full_report" ? "完整报告" : "精简方案表";

  return `配纸方案-${timestamp}-${typeLabel}.pdf`;
}

function toBoxSpecRows(snapshot: SnapshotObject): Record<string, string> {
  const stackingRequirement = toObject(snapshot.stackingRequirement);

  return {
    纸箱尺寸: `${formatNumber(snapshot.lengthMm)} x ${formatNumber(snapshot.widthMm)} x ${formatNumber(snapshot.heightMm)} mm`,
    结构类型: getString(snapshot.structureType, "-"),
    成箱方式: getString(snapshot.formingMethod, "-"),
    产品类型: getString(snapshot.productType, "-"),
    内装物重量: `${formatNumber(snapshot.productWeightKg)} kg`,
    排列方式: getString(snapshot.arrangement, "-"),
    堆码要求:
      getString(stackingRequirement.displayText, "") ||
      (stackingRequirement.stackingLayers ? `${formatNumber(stackingRequirement.stackingLayers)} 层` : "-"),
    生产数量: `${formatNumber(snapshot.productionQuantity)} 个`,
    特殊要求: getString(snapshot.specialRequirements, "-"),
  };
}

function toRecommendationSummary(value: unknown): MatchingSchemePdfSchemeSummary {
  const slot = toObject(value);
  const evaluation = toObject(slot.evaluation);
  const detail = toSchemeDetail(evaluation, true);

  return {
    title: getString(slot.title, "推荐方案"),
    status: getStatusLabel(evaluation),
    configuration: detail.configuration,
    strength: detail.strength,
    cost: detail.cost,
    conclusion: createRecommendationConclusion(evaluation),
  };
}

function toSchemeDetail(
  snapshot: SnapshotObject,
  showCost: boolean,
): MatchingSchemePdfSchemeDetail {
  const candidate = toObject(snapshot.candidate);

  return {
    configuration: [
      { label: "层数", value: `${formatNumber(candidate.layerCount)} 层` },
      { label: "瓦型", value: `${getString(candidate.fluteType, "-")} 楞` },
      { label: "纸张组合", value: toPaperCombination(candidate) },
    ],
    paperLayers: toPaperLayers(candidate),
    strength: toStrengthRows(snapshot),
    cost: showCost ? toCostRows(snapshot) : [],
  };
}

function toPaperCombination(candidate: SnapshotObject): string {
  return toArray(candidate.layers)
    .map((layer) => getString(toObject(toObject(layer).paper).paperCode, "-"))
    .join(" / ");
}

function toPaperLayers(candidate: SnapshotObject): MatchingSchemePdfPaperLayer[] {
  return toArray(candidate.layers).map((layerValue) => {
    const layer = toObject(layerValue);
    const paper = toObject(layer.paper);

    return {
      role: layerRoleLabels[getString(layer.role, "")] ?? getString(layer.role, "-"),
      paperCode: getString(paper.paperCode, "-"),
      paperName: getString(paper.name, "-"),
      factoryName: getString(paper.factoryName, "-"),
      gramWeight:
        paper.gramWeightGsm === null || paper.gramWeightGsm === undefined
          ? "-"
          : `${formatNumber(paper.gramWeightGsm)} gsm`,
    };
  });
}

function toStrengthRows(snapshot: SnapshotObject): MatchingSchemePdfLabeledValue[] {
  const strength = toObject(snapshot.strength);
  const device = toObject(snapshot.device);

  return [
    { label: "空箱抗压", value: `${formatNumber(strength.bctN)} N` },
    { label: "边压", value: `${formatDecimal(strength.edgeCrushKnPerM, 2)} kN/m` },
    { label: "耐破", value: formatNumber(strength.burstStrength) },
    {
      label: "达标状态",
      value: strength.isQualified === false ? "未达标" : getStatusLabel(snapshot),
    },
    {
      label: "可生产状态",
      value: device.isManufacturable === false ? "不可生产" : "可生产",
    },
  ];
}

function toCostRows(snapshot: SnapshotObject): MatchingSchemePdfLabeledValue[] {
  const cost = toObject(snapshot.cost);
  const layerUnitPrices = toArray(cost.layerUnitPrices)
    .map((item) => {
      const price = toObject(item);

      return `${getString(price.paperCode, "-")} ${formatDecimal(price.unitPriceYuanPerSquareMeter, 4)} 元/m2`;
    })
    .join("；");

  return [
    { label: "单箱含税成本", value: `${formatDecimal(cost.taxIncludedCostYuan, 2)} 元` },
    { label: "各层单价", value: layerUnitPrices || "-" },
    { label: "用纸总价", value: `${formatDecimal(cost.paperCostYuan, 2)} 元` },
    { label: "加工费用", value: `${formatDecimal(cost.processingFeeYuan, 2)} 元` },
    { label: "税金", value: `${formatDecimal(cost.taxYuan, 2)} 元` },
  ];
}

function createRecommendationConclusion(snapshot: SnapshotObject): string {
  const explicitReason =
    getString(snapshot.recommendationReason, "") ||
    getString(snapshot.selectionReason, "") ||
    getString(snapshot.reason, "");

  if (explicitReason) {
    return explicitReason;
  }

  const warnings = toArray(snapshot.warningMessages).filter(
    (item): item is string => typeof item === "string",
  );

  if (warnings.length > 0) {
    return warnings.join("；");
  }

  const statusLabel = getStatusLabel(snapshot);
  const manufacturable = toObject(snapshot.device).isManufacturable === false ? "不可生产" : "可生产";

  return `该方案${statusLabel}且${manufacturable}，可作为确认配纸方案。`;
}

function getStatusLabel(snapshot: SnapshotObject): string {
  const finalStatus = getString(snapshot.finalStatus, "");

  return finalStatusLabels[finalStatus] ?? "未知";
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

function formatNumber(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "-";
}

function formatDecimal(value: unknown, fractionDigits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(fractionDigits) : "-";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
