import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { CalculationParameters, CandidateEvaluation } from "@/modules/calculations/types";
import type { RecommendationSlot, RecommendationStrategy } from "@/modules/recommendation/types";
import type { ActionResult } from "@/shared/types/action-result";

import type {
  MatchingSchemeFinalStatus,
  MatchingSchemeHistorySnapshot,
  MatchingSchemePriceSnapshot,
  OriginalRecommendationSlotsSnapshot,
} from "./types";

export const DEFAULT_PARAMETER_VERSION = "prd-v1-default";

const INCOMPLETE_ORIGINAL_RECOMMENDATIONS_MESSAGE =
  "原始推荐结果不完整，请重新生成方案";

export function createHistorySnapshot(input: {
  boxSpec: NormalizedBoxSpec;
  originalRecommendationSlots: RecommendationSlot[];
  selectedStrategy?: RecommendationStrategy | undefined;
  finalEvaluation: CandidateEvaluation;
  parameters: CalculationParameters;
  isManuallyAdjusted: boolean;
  savedAt: Date;
  parameterVersion?: string | undefined;
}): ActionResult<MatchingSchemeHistorySnapshot> {
  if (input.originalRecommendationSlots.length !== 3) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: INCOMPLETE_ORIGINAL_RECOMMENDATIONS_MESSAGE,
        details: {
          fieldErrors: [
            {
              field: "originalRecommendationSlots",
              message: INCOMPLETE_ORIGINAL_RECOMMENDATIONS_MESSAGE,
            },
          ],
        },
      },
    };
  }

  const finalStatus = resolveFinalStatus(input.finalEvaluation);
  const warningMessages = createWarningMessages(finalStatus);
  const parameterVersion = input.parameterVersion ?? DEFAULT_PARAMETER_VERSION;

  return {
    ok: true,
    data: {
      boxSpecSnapshot: input.boxSpec,
      productionQuantity: input.boxSpec.productionQuantity,
      originalRecommendationSlotsSnapshot:
        input.originalRecommendationSlots as OriginalRecommendationSlotsSnapshot,
      ...(input.selectedStrategy !== undefined ? { selectedStrategy: input.selectedStrategy } : {}),
      finalSchemeSnapshot: {
        ...input.finalEvaluation,
        finalStatus,
        warningMessages,
        parameterSnapshot: input.parameters,
      },
      finalStatus,
      isManuallyAdjusted: input.isManuallyAdjusted,
      priceSnapshot: createPriceSnapshot(input.finalEvaluation),
      parameterVersion,
      parameterSnapshot: input.parameters,
      warningMessages,
      exportRecords: [],
      savedAt: input.savedAt,
    },
  };
}

function createPriceSnapshot(evaluation: CandidateEvaluation): MatchingSchemePriceSnapshot[] {
  return evaluation.candidate.layers.map((layer) => ({
    paperMaterialId: layer.paper.id,
    paperCode: layer.paper.paperCode,
    ...(layer.paper.factoryName !== undefined ? { factoryName: layer.paper.factoryName } : {}),
    ...(layer.paper.name !== undefined ? { name: layer.paper.name } : {}),
    role: layer.role,
    ...(layer.flute !== undefined ? { flute: layer.flute } : {}),
    gramWeightGsm: layer.paper.gramWeightGsm,
    priceYuanPerTon: layer.paper.priceYuanPerTon,
    burstIndex: layer.paper.burstIndex,
    ringCrushIndex: layer.paper.ringCrushIndex,
  }));
}

function resolveFinalStatus(evaluation: CandidateEvaluation): MatchingSchemeFinalStatus {
  if (evaluation.status === "eligible") {
    return "qualified";
  }

  if (evaluation.reasons.some((reason) => reason.type === "NOT_MANUFACTURABLE")) {
    return "not_manufacturable";
  }

  if (evaluation.reasons.some((reason) => reason.type === "STRENGTH_UNQUALIFIED")) {
    return "unqualified";
  }

  return "data_incomplete";
}

function createWarningMessages(finalStatus: MatchingSchemeFinalStatus): string[] {
  if (finalStatus === "unqualified") {
    return ["最终方案未达标，不建议生产"];
  }

  if (finalStatus === "not_manufacturable") {
    return ["最终方案不可生产，不建议生产"];
  }

  if (finalStatus === "data_incomplete") {
    return ["最终方案数据不足，请补全基础数据后再用于生产"];
  }

  return [];
}
