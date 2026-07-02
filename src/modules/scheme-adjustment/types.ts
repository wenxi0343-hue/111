import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type {
  CalculationParameters,
  CandidateEvaluation,
  CandidateLayerRole,
  FluteType,
  LayerCount,
  SingleFluteType,
} from "@/modules/calculations/types";
import type { RecommendationSlot, RecommendationStrategy } from "@/modules/recommendation/types";

export type MatchingSchemeFinalStatus =
  | "qualified"
  | "unqualified"
  | "not_manufacturable"
  | "data_incomplete";

export interface MatchingSchemePriceSnapshot {
  paperMaterialId: string;
  paperCode: string;
  factoryName?: string | undefined;
  name?: string | undefined;
  role: CandidateLayerRole;
  flute?: SingleFluteType | undefined;
  gramWeightGsm?: number | null | undefined;
  priceYuanPerTon?: number | null | undefined;
  burstIndex?: number | null | undefined;
  ringCrushIndex?: number | null | undefined;
}

export interface SchemeAdjustmentLayerInput {
  role: CandidateLayerRole;
  flute?: SingleFluteType | undefined;
  paperMaterialId: string;
}

export interface SchemeAdjustmentInput {
  layerCount?: LayerCount | undefined;
  fluteType?: FluteType | undefined;
  layers?: SchemeAdjustmentLayerInput[] | undefined;
}

export interface RecalculateAdjustedSchemeResult {
  finalEvaluation: CandidateEvaluation;
  finalStatus: MatchingSchemeFinalStatus;
  isManuallyAdjusted: boolean;
  warningMessages: string[];
  canSave: boolean;
}

export type OriginalRecommendationSlotsSnapshot = [
  RecommendationSlot,
  RecommendationSlot,
  RecommendationSlot,
];

export interface MatchingSchemeHistorySnapshot {
  boxSpecSnapshot: NormalizedBoxSpec;
  productionQuantity: number;
  originalRecommendationSlotsSnapshot: OriginalRecommendationSlotsSnapshot;
  selectedStrategy?: RecommendationStrategy | undefined;
  finalSchemeSnapshot: CandidateEvaluation & {
    finalStatus: MatchingSchemeFinalStatus;
    warningMessages: string[];
    parameterSnapshot: CalculationParameters;
  };
  finalStatus: MatchingSchemeFinalStatus;
  isManuallyAdjusted: boolean;
  priceSnapshot: MatchingSchemePriceSnapshot[];
  parameterVersion: string;
  parameterSnapshot: CalculationParameters;
  warningMessages: string[];
  exportRecords: [];
  savedAt: Date;
}
