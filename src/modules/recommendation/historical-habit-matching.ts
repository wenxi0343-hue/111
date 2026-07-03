import type { MatchingCandidate, RejectionReason } from "@/modules/calculations/types";
import type { HistoricalHabitRecommendationContext } from "@/modules/historical-orders/recommendation-context";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";

import type {
  HistoricalHabitEvidence,
  HistoricalHabitMatchedField,
  HistoricalHabitMatchLevel,
  RecommendationHistoricalHabitInfo,
} from "./types";
import type {
  HistoricalHabitCandidateEvidence,
  HistoricalHabitCandidateUnavailableRecord,
} from "./historical-habit-candidates";

const INSUFFICIENT_LABEL = "暂无足够历史参考";

export function createRecommendationHistoricalHabitInfo(input: {
  candidate: MatchingCandidate;
  historicalHabitContext: HistoricalHabitRecommendationContext;
  evidences?: HistoricalHabitCandidateEvidence[] | undefined;
  conflictMessages?: string[] | undefined;
}): RecommendationHistoricalHabitInfo {
  if (input.historicalHabitContext.status !== "available") {
    return {
      level: "insufficient",
      label: INSUFFICIENT_LABEL,
      reasons: [createInsufficientReason(input.historicalHabitContext)],
      evidences: [],
      conflictMessages: input.conflictMessages ?? [],
    };
  }

  const evidences = (input.evidences ?? [])
    .map((evidence) => toHistoricalHabitEvidence(input.candidate, evidence.summary))
    .filter((evidence): evidence is HistoricalHabitEvidence => evidence !== undefined)
    .sort(compareEvidence)
    .slice(0, 3);
  const level = resolveMatchLevel(evidences);

  return {
    level,
    label: toMatchLabel(level),
    reasons: evidences.map(createReasonFromEvidence),
    evidences,
    conflictMessages: input.conflictMessages ?? [],
  };
}

export function createHistoricalHabitConflictMessages(input: {
  rejectedReasons?: RejectionReason[] | undefined;
  unavailableRecords?: HistoricalHabitCandidateUnavailableRecord[] | undefined;
}): string[] {
  const messages: string[] = [];

  for (const record of input.unavailableRecords ?? []) {
    if (!messages.includes(record.message)) {
      messages.push(record.message);
    }
  }

  const strengthReason = input.rejectedReasons?.find(
    (reason) => reason.type === "STRENGTH_UNQUALIFIED",
  );

  if (strengthReason) {
    messages.push(`历史常用组合未直接采用：${strengthReason.message}`);
  }

  const deviceReason = input.rejectedReasons?.find(
    (reason) => reason.type === "NOT_MANUFACTURABLE",
  );

  if (deviceReason) {
    messages.push(`历史常用组合未直接采用，存在设备限制：${deviceReason.message}`);
  }

  return messages;
}

function toHistoricalHabitEvidence(
  candidate: MatchingCandidate,
  summary: HistoricalOrderHabitSummaryItem,
): HistoricalHabitEvidence | undefined {
  const matchedFields = getMatchedFields(candidate, summary);

  if (matchedFields.length === 0) {
    return undefined;
  }

  return {
    dimensionType: summary.dimensionType,
    dimensionKey: summary.dimensionKey,
    matchedFields,
    layerCount: summary.layerCount,
    flute: summary.flute,
    orderCount: summary.orderCount,
    frequency: summary.frequency,
  };
}

function getMatchedFields(
  candidate: MatchingCandidate,
  summary: HistoricalOrderHabitSummaryItem,
): HistoricalHabitMatchedField[] {
  const matchedFields: HistoricalHabitMatchedField[] = [];

  if (summary.layerCount !== undefined && candidate.layerCount === summary.layerCount) {
    matchedFields.push("layer_count");
  }

  if (summary.flute !== undefined && candidate.fluteType === summary.flute) {
    matchedFields.push("flute");
  }

  if (
    summary.factoryNames.length > 0 &&
    candidate.layers.some((layer) =>
      summary.factoryNames.includes(layer.paper.factoryName ?? ""),
    )
  ) {
    matchedFields.push("factory");
  }

  if (
    summary.gramWeights.length > 0 &&
    candidate.layers.some((layer) =>
      summary.gramWeights.includes(Number(layer.paper.gramWeightGsm)),
    )
  ) {
    matchedFields.push("gram_weight");
  }

  return matchedFields;
}

function resolveMatchLevel(evidences: HistoricalHabitEvidence[]): HistoricalHabitMatchLevel {
  if (evidences.length === 0) {
    return "low";
  }

  if (
    evidences.some(
      (evidence) =>
        evidence.orderCount >= 5 &&
        includesAll(evidence.matchedFields, ["layer_count", "flute"]) &&
        (evidence.matchedFields.includes("factory") ||
          evidence.matchedFields.includes("gram_weight")),
    )
  ) {
    return "high";
  }

  if (
    evidences.some(
      (evidence) =>
        includesAll(evidence.matchedFields, ["layer_count", "flute"]) ||
        ((evidence.matchedFields.includes("layer_count") ||
          evidence.matchedFields.includes("flute")) &&
          (evidence.matchedFields.includes("factory") ||
            evidence.matchedFields.includes("gram_weight"))),
    )
  ) {
    return "medium";
  }

  return "low";
}

function includesAll<T>(items: T[], requiredItems: T[]): boolean {
  return requiredItems.every((item) => items.includes(item));
}

function toMatchLabel(
  level: HistoricalHabitMatchLevel,
): RecommendationHistoricalHabitInfo["label"] {
  if (level === "high") {
    return "高匹配";
  }

  if (level === "medium") {
    return "中匹配";
  }

  if (level === "low") {
    return "低匹配";
  }

  return INSUFFICIENT_LABEL;
}

function createReasonFromEvidence(evidence: HistoricalHabitEvidence): string {
  const parts = [`${evidence.dimensionKey}中`];
  const layerLabel = evidence.matchedFields.includes("layer_count") ? "层数" : "";
  const fluteLabel = evidence.matchedFields.includes("flute") ? "瓦型" : "";
  const combinationLabel = [layerLabel, fluteLabel].filter(Boolean).join("和");
  const habitText = combinationLabel ? `${combinationLabel}与历史摘要一致` : "存在历史摘要匹配";

  parts.push(habitText);

  if (evidence.matchedFields.includes("flute")) {
    parts.push(`${evidence.flute ?? "该"} 瓦`);
  }

  parts.push(`出现 ${evidence.orderCount} 次`);
  parts.push(`占比 ${formatPercent(evidence.frequency)}`);

  return parts.join("，");
}

function createInsufficientReason(context: HistoricalHabitRecommendationContext): string {
  if (context.similarOrderCount < 5) {
    return `暂无足够历史参考：相似历史订单少于 5 条，本次按现有推荐逻辑生成方案。`;
  }

  return "暂无足够历史参考：本次按现有推荐逻辑生成方案。";
}

function compareEvidence(left: HistoricalHabitEvidence, right: HistoricalHabitEvidence): number {
  const countDifference = right.orderCount - left.orderCount;

  if (countDifference !== 0) {
    return countDifference;
  }

  return right.frequency - left.frequency;
}

function formatPercent(frequency: number): string {
  return `${Math.round(frequency * 100)}%`;
}
