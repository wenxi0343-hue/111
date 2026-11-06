import type {
  CandidateEvaluation,
  RejectedCandidateEvaluation,
  RejectedCandidateSummary,
  RejectionReason,
} from "@/modules/calculations/types";
import type { SelectionReason } from "@/modules/ai-reasoning/types";

export type RecommendationStrategy =
  "standard" | "cost_down" | "enhanced" | "economy" | "safety" | "balanced";

export type RecommendationSlotStatus = "recommended" | "repeated" | "unavailable" | "reference";

export interface RecommendationSlot {
  strategy: RecommendationStrategy;
  title: "标准方案" | "降本方案" | "增强方案" | "经济型" | "安全型" | "均衡型";
  status: RecommendationSlotStatus;
  isOfficialRecommendation: boolean;
  evaluation?: CandidateEvaluation | undefined;
  selectionReason?: SelectionReason | undefined;
  messages: string[];
  repeatedFrom?: RecommendationStrategy | undefined;
  unavailableReasons: RejectionReason[];
}

export interface SelectMatchingRecommendationsResult {
  slots: RecommendationSlot[];
  rejectedSummary: RejectedCandidateSummary[];
  rejectedCandidates: RejectedCandidateEvaluation[];
  globalMessages: string[];
}

export interface RecommendationOptions {
  standardTargetMinSurplusRate?: number | undefined;
  standardTargetMaxSurplusRate?: number | undefined;
  enhancedTargetMinSurplusRate?: number | undefined;
  enhancedTargetMaxSurplusRate?: number | undefined;
  costDownMinStrengthRatioToStandard?: number | undefined;
}
