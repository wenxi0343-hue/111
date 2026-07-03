import type {
  CandidateEvaluation,
  EligibleCandidateEvaluation,
  RejectedCandidateEvaluation,
  RejectedCandidateSummary,
  RejectionReason,
} from "@/modules/calculations/types";

export type RecommendationStrategy = "economy" | "safety" | "balanced";

export type RecommendationSlotStatus = "recommended" | "repeated" | "unavailable" | "reference";

export type HistoricalHabitMatchLevel = "high" | "medium" | "low" | "insufficient";

export type HistoricalHabitMatchedField =
  | "layer_count"
  | "flute"
  | "factory"
  | "gram_weight";

export interface HistoricalHabitEvidence {
  dimensionType: "product" | "size_bucket" | "weight_bucket";
  dimensionKey: string;
  matchedFields: HistoricalHabitMatchedField[];
  layerCount?: number | undefined;
  flute?: string | undefined;
  orderCount: number;
  frequency: number;
}

export interface RecommendationHistoricalHabitInfo {
  level: HistoricalHabitMatchLevel;
  label: "高匹配" | "中匹配" | "低匹配" | "暂无足够历史参考";
  reasons: string[];
  evidences: HistoricalHabitEvidence[];
  conflictMessages: string[];
}

export interface HistoricalHabitSelectionContext {
  status: "available" | "insufficient" | "unavailable";
  historicalHabitByCandidateFingerprint: Record<string, RecommendationHistoricalHabitInfo>;
  globalMessages: string[];
}

export interface RecommendationSlot {
  strategy: RecommendationStrategy;
  title: "经济型" | "安全型" | "均衡型";
  status: RecommendationSlotStatus;
  isOfficialRecommendation: boolean;
  evaluation?: CandidateEvaluation | undefined;
  messages: string[];
  repeatedFrom?: RecommendationStrategy | undefined;
  unavailableReasons: RejectionReason[];
  historicalHabit?: RecommendationHistoricalHabitInfo | undefined;
}

export interface SelectMatchingRecommendationsResult {
  slots: [RecommendationSlot, RecommendationSlot, RecommendationSlot];
  rejectedSummary: RejectedCandidateSummary[];
  rejectedCandidates: RejectedCandidateEvaluation[];
  globalMessages: string[];
}

export interface RecommendationOptions {
  balancedCostWeight: number;
  balancedSafetyWeight: number;
  historicalHabitWeight?: number | undefined;
  maxSafetySurplusRate: number;
}

export interface BalancedCandidateScore {
  evaluation: EligibleCandidateEvaluation;
  costScore: number;
  safetyScore: number;
  historicalHabitScore?: number | undefined;
  balancedScore: number;
}
