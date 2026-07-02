import type {
  CandidateEvaluation,
  EligibleCandidateEvaluation,
  RejectedCandidateEvaluation,
  RejectedCandidateSummary,
  RejectionReason,
} from "@/modules/calculations/types";

export type RecommendationStrategy = "economy" | "safety" | "balanced";

export type RecommendationSlotStatus = "recommended" | "repeated" | "unavailable" | "reference";

export interface RecommendationSlot {
  strategy: RecommendationStrategy;
  title: "经济型" | "安全型" | "均衡型";
  status: RecommendationSlotStatus;
  isOfficialRecommendation: boolean;
  evaluation?: CandidateEvaluation | undefined;
  messages: string[];
  repeatedFrom?: RecommendationStrategy | undefined;
  unavailableReasons: RejectionReason[];
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
  maxSafetySurplusRate: number;
}

export interface BalancedCandidateScore {
  evaluation: EligibleCandidateEvaluation;
  costScore: number;
  safetyScore: number;
  balancedScore: number;
}
