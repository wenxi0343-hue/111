import type { RejectionReason } from "@/modules/calculations/types";
import type { RecommendationStrategy } from "./types";

export const GLOBAL_REFERENCE_MESSAGE = "当前没有达标可生产方案，以下仅供调整参考";
export const REPEATED_RECOMMENDATION_MESSAGE = "该组合同时也是某策略下最优";
export const SAFETY_SURPLUS_OVER_LIMIT_MESSAGE = "所有安全型候选抗压富余率超过 200% 上限";
export const NO_DISPLAYABLE_REFERENCE_MESSAGE = "没有可展示的参考方案";
export const NO_ELIGIBLE_CANDIDATE_MESSAGE = "没有达标可生产候选";
export const NO_DISTINCT_ELIGIBLE_CANDIDATE_MESSAGE = "没有更多不同的达标可生产候选组合";

export function createUnavailableReason(input: {
  code: string;
  message: string;
  field?: RecommendationStrategy | undefined;
}): RejectionReason {
  return {
    type: "PARAMETER_ERROR",
    code: input.code,
    message: input.message,
    field: input.field,
  };
}
