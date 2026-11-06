import type { CandidateEvaluation, RejectionReason } from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import type {
  SelectionReasonFacts,
  SelectionReasonFinalStatus,
  SelectionReasonStrategy,
  SelectionReasonStrategyLabel,
} from "@/modules/ai-reasoning/types";

const STRATEGY_LABELS: Record<SelectionReasonStrategy, SelectionReasonStrategyLabel> = {
  standard: "标准方案",
  cost_down: "降本方案",
  enhanced: "增强方案",
  economy: "经济型",
  safety: "安全型",
  balanced: "均衡型",
  adjusted: "调整后方案",
};

export function extractSelectionReasonFactsFromSlot(
  slot: RecommendationSlot,
): SelectionReasonFacts {
  const isOfficialRecommendation =
    slot.isOfficialRecommendation && slot.status !== "reference" && slot.status !== "unavailable";

  if (slot.evaluation === undefined) {
    return {
      strategy: slot.strategy,
      strategyLabel: STRATEGY_LABELS[slot.strategy],
      isOfficialRecommendation,
      finalStatus: "data_incomplete",
      layerCount: 0,
      fluteType: "",
      paperSummary: [],
      riskMessages: slot.unavailableReasons.map((reason) => reason.message),
      statusMessages: [
        ...slot.messages,
        ...slot.unavailableReasons.map((reason) => reason.message),
      ],
    };
  }

  return extractSelectionReasonFactsFromEvaluation({
    evaluation: slot.evaluation,
    strategy: slot.strategy,
    isOfficialRecommendation,
    statusMessages: slot.messages,
  });
}

export function extractSelectionReasonFactsFromEvaluation(input: {
  evaluation: CandidateEvaluation;
  strategy: SelectionReasonStrategy;
  strategyLabel?: SelectionReasonStrategyLabel | undefined;
  isOfficialRecommendation: boolean;
  statusMessages?: string[] | undefined;
}): SelectionReasonFacts {
  const { evaluation } = input;

  return {
    strategy: input.strategy,
    strategyLabel: input.strategyLabel ?? STRATEGY_LABELS[input.strategy],
    isOfficialRecommendation: input.isOfficialRecommendation,
    finalStatus: getFinalStatus(evaluation),
    layerCount: evaluation.candidate.layerCount,
    fluteType: evaluation.candidate.fluteType,
    paperSummary: evaluation.candidate.layers.map((layer) => layer.paper.paperCode),
    cost: extractCost(evaluation),
    strength: extractStrength(evaluation),
    riskMessages: getRiskMessages(evaluation),
    statusMessages: input.statusMessages ?? [],
  };
}

function getFinalStatus(evaluation: CandidateEvaluation): SelectionReasonFinalStatus {
  if (evaluation.status === "eligible") {
    return "qualified";
  }

  if (hasReasonType(evaluation.reasons, "NOT_MANUFACTURABLE")) {
    return "not_manufacturable";
  }

  if (hasReasonType(evaluation.reasons, "STRENGTH_UNQUALIFIED")) {
    return "unqualified";
  }

  return "data_incomplete";
}

function extractCost(evaluation: CandidateEvaluation): SelectionReasonFacts["cost"] {
  if (evaluation.cost === undefined) {
    return undefined;
  }

  return {
    taxIncludedCostYuan: evaluation.cost.taxIncludedCostYuan,
  };
}

function extractStrength(evaluation: CandidateEvaluation): SelectionReasonFacts["strength"] {
  if (evaluation.strength === undefined) {
    return undefined;
  }

  return {
    bctN: evaluation.strength.bctN,
    edgeCrushKnPerM: evaluation.strength.edgeCrushKnPerM,
    burstStrength: evaluation.strength.burstStrength,
  };
}

function getRiskMessages(evaluation: CandidateEvaluation): string[] {
  if (evaluation.status === "eligible") {
    return [
      ...evaluation.device.reasons.map((reason) => reason.message),
      ...evaluation.strength.reasons.map((reason) => reason.message),
    ];
  }

  return evaluation.reasons.map((reason) => reason.message);
}

function hasReasonType(reasons: RejectionReason[], type: RejectionReason["type"]): boolean {
  return reasons.some((reason) => reason.type === type);
}
