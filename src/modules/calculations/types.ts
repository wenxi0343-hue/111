import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

export type LayerCount = 3 | 5 | 7;

export type SingleFluteType = "A" | "B" | "C" | "E";

export type FluteType =
  | SingleFluteType
  | "AB"
  | "AC"
  | "BC"
  | "BA"
  | "BE"
  | "BAC";

export type BoardThicknessFluteType = Exclude<FluteType, "AB">;

export type CandidateLayerRole = "outer_liner" | "inner_liner" | "corrugating" | "medium";

export type RejectionReasonType =
  | "DATA_MISSING"
  | "PARAMETER_ERROR"
  | "NOT_MANUFACTURABLE"
  | "STRENGTH_UNQUALIFIED";

export interface RejectionReason {
  type: RejectionReasonType;
  code: string;
  message: string;
  field?: string | undefined;
}

export interface CandidatePaperMaterial {
  id: string;
  paperCode: string;
  factoryName?: string | undefined;
  name?: string | undefined;
  gramWeightGsm?: number | null | undefined;
  priceYuanPerTon?: number | null | undefined;
  burstIndex?: number | null | undefined;
  ringCrushIndex?: number | null | undefined;
}

export interface CandidateLayer {
  role: CandidateLayerRole;
  paper: CandidatePaperMaterial;
  flute?: SingleFluteType | undefined;
}

export interface MatchingCandidate {
  id: string;
  layerCount: LayerCount;
  fluteType: FluteType;
  layers: CandidateLayer[];
}

export interface BoardMachineParameters {
  maxLengthMm: number;
  maxWidthMm: number;
  minLengthMm: number;
  minWidthMm: number;
}

export interface PrinterSlotterParameters {
  maxFeedLengthMm: number;
  maxFeedWidthMm: number;
  minFeedLengthMm: number;
  minFeedWidthMm: number;
  allowFeedRotation: boolean;
  maxPrintLengthMm: number;
  maxPrintWidthMm: number;
  minSlotIntervalMm: {
    firstPanel: number;
    firstSlot: number;
    secondPanel: number;
    secondSlot: number;
  };
  maxBoxHeightMm: number;
}

export interface DeviceLimitParameters {
  boardMachine: BoardMachineParameters;
  printerSlotter: PrinterSlotterParameters;
}

export interface StrengthThreshold {
  minBctN: number;
  minEdgeCrushKnPerM: number;
}

export interface UtilizationRateRule {
  minQuantity: number;
  rate: number;
}

export interface CalculationParameters {
  deviceLimits: DeviceLimitParameters;
  corrugationTakeUpFactors: Record<SingleFluteType, number>;
  edgeCrushCorrectionFactor: number;
  boardThicknessMm: Record<BoardThicknessFluteType, number>;
  strengthThresholds: Record<LayerCount, StrengthThreshold>;
  burstStrengthThresholdsByLayerCount: Record<LayerCount, number>;
  processingFeeFactorsByLayerCount: Record<LayerCount, number>;
  utilizationRateRules: UtilizationRateRule[];
  maxUtilizationRate: number;
  padFeeYuan: number;
}

export interface BoardAreaResult {
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  boardLengthMm: number;
  boardWidthMm: number;
  feedLengthMm: number;
  feedWidthMm: number;
  printLengthMm: number;
  printWidthMm: number;
  slotIntervalsMm: {
    firstPanel: number;
    firstSlot: number;
    secondPanel: number;
    secondSlot: number;
  };
  areaSquareMeters: number;
  formingPieces: 1 | 2;
  flapMm: number;
  tongueMm: number;
}

export interface DeviceLimitResult {
  isManufacturable: boolean;
  reasons: RejectionReason[];
}

export interface StrengthResult {
  burstStrength: number;
  edgeCrushNPerM: number;
  edgeCrushKnPerM: number;
  bctN: number;
  isQualified: boolean;
  reasons: RejectionReason[];
}

export interface CostResult {
  utilizationRate: number;
  padFeeYuan: number;
  layerUnitPrices: Array<{
    role: CandidateLayerRole;
    paperCode: string;
    unitPriceYuanPerSquareMeter: number;
  }>;
  paperCostYuan: number;
  processingFeeYuan: number;
  taxYuan: number;
  taxIncludedCostYuan: number;
}

export interface EligibleCandidateEvaluation {
  status: "eligible";
  candidate: MatchingCandidate;
  area: BoardAreaResult;
  device: DeviceLimitResult;
  strength: StrengthResult;
  cost: CostResult;
}

export interface RejectedCandidateEvaluation {
  status: "rejected";
  candidate: MatchingCandidate;
  reasons: RejectionReason[];
  area?: BoardAreaResult | undefined;
  device?: DeviceLimitResult | undefined;
  strength?: StrengthResult | undefined;
  cost?: CostResult | undefined;
}

export type CandidateEvaluation = EligibleCandidateEvaluation | RejectedCandidateEvaluation;

export interface CandidateEvaluationCalculators {
  calculateBoardArea(input: {
    boxSpec: NormalizedBoxSpec;
    layerCount: LayerCount;
    fluteType: FluteType;
  }): BoardAreaResult;
  checkDeviceLimits(input: {
    board: BoardAreaResult;
    boxSpec: NormalizedBoxSpec;
    parameters: DeviceLimitParameters;
  }): DeviceLimitResult;
  calculateStrength(input: {
    boxSpec: NormalizedBoxSpec;
    candidate: MatchingCandidate;
    area: BoardAreaResult;
    parameters: CalculationParameters;
  }): StrengthResult;
  calculateCost(input: {
    boxSpec: NormalizedBoxSpec;
    candidate: MatchingCandidate;
    area: BoardAreaResult;
    parameters: CalculationParameters;
  }): CostResult;
}

export interface EvaluateCandidateInput {
  boxSpec: NormalizedBoxSpec;
  candidate: MatchingCandidate;
  parameters?: CalculationParameters | undefined;
  calculators?: Partial<CandidateEvaluationCalculators> | undefined;
}

export interface RejectedCandidateSummary {
  type: RejectionReasonType;
  label: string;
  count: number;
}

export interface EvaluateMatchingCandidatesInput {
  boxSpec: NormalizedBoxSpec;
  candidates: MatchingCandidate[];
  parameters?: CalculationParameters | undefined;
  evaluateCandidateFn?: ((input: EvaluateCandidateInput) => CandidateEvaluation) | undefined;
}

export interface EvaluateMatchingCandidatesResult {
  eligibleCandidates: EligibleCandidateEvaluation[];
  rejectedCandidates: RejectedCandidateEvaluation[];
  rejectedSummary: RejectedCandidateSummary[];
}
