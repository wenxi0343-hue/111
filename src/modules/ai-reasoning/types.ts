import type { RecommendationStrategy } from "@/modules/recommendation/types";

export type SelectionReasonSource = "ai" | "template";

export type SelectionReasonFallbackReason =
  | "provider_not_configured"
  | "provider_failed"
  | "provider_timeout"
  | "daily_limit_reached"
  | "validation_failed";

export type SelectionReasonStrategy = RecommendationStrategy | "adjusted";

export type SelectionReasonStrategyLabel =
  "标准方案" | "降本方案" | "增强方案" | "经济型" | "安全型" | "均衡型" | "调整后方案";

export type SelectionReasonFinalStatus =
  "qualified" | "unqualified" | "not_manufacturable" | "data_incomplete";

export interface SelectionReason {
  source: SelectionReasonSource;
  sourceLabel: "AI 生成" | "模板生成";
  text: string;
  fallbackReason?: SelectionReasonFallbackReason | undefined;
  generatedAt: string;
}

export interface SelectionReasonFacts {
  strategy: SelectionReasonStrategy;
  strategyLabel: SelectionReasonStrategyLabel;
  isOfficialRecommendation: boolean;
  finalStatus: SelectionReasonFinalStatus;
  layerCount: number;
  fluteType: string;
  paperSummary: string[];
  cost?:
    | {
        taxIncludedCostYuan: number;
      }
    | undefined;
  strength?:
    | {
        bctN: number;
        edgeCrushKnPerM: number;
        burstStrength: number;
      }
    | undefined;
  riskMessages: string[];
  statusMessages: string[];
}
