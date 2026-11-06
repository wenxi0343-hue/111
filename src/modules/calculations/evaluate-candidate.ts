import { calculateBoardArea } from "./calculate-area";
import { calculateCost } from "./calculate-cost";
import { calculateStrength } from "./calculate-strength";
import { checkDeviceLimits } from "./check-device-limits";
import { DEFAULT_CALCULATION_PARAMETERS } from "./default-parameters";
import type {
  BoardThicknessFluteType,
  CandidateEvaluation,
  CandidateEvaluationCalculators,
  CandidateLayer,
  EvaluateCandidateInput,
  FluteType,
  MatchingCandidate,
  RejectionReason,
  SingleFluteType,
} from "./types";

const DEFAULT_CALCULATORS: CandidateEvaluationCalculators = {
  calculateBoardArea,
  checkDeviceLimits,
  calculateStrength,
  calculateCost,
};

export function evaluateCandidate(input: EvaluateCandidateInput): CandidateEvaluation {
  const {
    boxSpec,
    candidate,
    parameters = DEFAULT_CALCULATION_PARAMETERS,
    calculators: calculatorOverrides,
  } = input;
  const calculators = {
    ...DEFAULT_CALCULATORS,
    ...calculatorOverrides,
  };
  const dataMissingReasons = validateCandidateData(candidate);

  if (dataMissingReasons.length > 0) {
    return {
      status: "rejected",
      candidate,
      reasons: dataMissingReasons,
    };
  }

  const parameterErrorReasons = validateCalculationParameters(candidate, parameters);

  if (parameterErrorReasons.length > 0) {
    return {
      status: "rejected",
      candidate,
      reasons: parameterErrorReasons,
    };
  }

  const area = calculators.calculateBoardArea({
    boxSpec,
    layerCount: candidate.layerCount,
    fluteType: candidate.fluteType,
  });
  const device = calculators.checkDeviceLimits({
    board: area,
    boxSpec,
    parameters: parameters.deviceLimits,
  });

  if (!device.isManufacturable) {
    return {
      status: "rejected",
      candidate,
      area,
      device,
      reasons: device.reasons,
    };
  }

  const strength = calculators.calculateStrength({
    boxSpec,
    candidate,
    area,
    parameters,
  });
  const cost = calculators.calculateCost({
    boxSpec,
    candidate,
    area,
    parameters,
  });

  if (!strength.isQualified) {
    return {
      status: "rejected",
      candidate,
      area,
      device,
      strength,
      cost,
      reasons: strength.reasons,
    };
  }

  return {
    status: "eligible",
    candidate,
    area,
    device,
    strength,
    cost,
  };
}

function validateCandidateData(candidate: MatchingCandidate): RejectionReason[] {
  return candidate.layers.flatMap((layer, layerIndex) => {
    const prefix = `${layer.paper.paperCode || `第 ${layerIndex + 1} 层纸张`}`;
    const reasons: RejectionReason[] = [];

    if (!isFiniteNumber(layer.paper.gramWeightGsm)) {
      reasons.push(createDataMissingReason("PAPER_GRAM_WEIGHT_MISSING", `${prefix} 缺少克重`));
    }
    if (!isFiniteNumber(layer.paper.priceYuanPerTon)) {
      reasons.push(createDataMissingReason("PAPER_PRICE_MISSING", `${prefix} 缺少纸价`));
    }
    if (layer.role !== "corrugating" && !isFiniteNumber(layer.paper.burstIndex)) {
      reasons.push(createDataMissingReason("PAPER_BURST_INDEX_MISSING", `${prefix} 缺少耐破指数`));
    }
    if (!isFiniteNumber(layer.paper.ringCrushIndex)) {
      reasons.push(
        createDataMissingReason("PAPER_RING_CRUSH_INDEX_MISSING", `${prefix} 缺少环压指数`),
      );
    }

    return reasons;
  });
}

function validateCalculationParameters(
  candidate: MatchingCandidate,
  parameters: EvaluateCandidateInput["parameters"] = DEFAULT_CALCULATION_PARAMETERS,
): RejectionReason[] {
  const reasons: RejectionReason[] = [];

  for (const layer of candidate.layers) {
    if (layer.role === "corrugating") {
      const flute = resolveCorrugatingFlute(layer, candidate);

      if (!flute) {
        reasons.push(
          createParameterErrorReason(
            "CORRUGATING_FLUTE_MISSING",
            `${layer.paper.paperCode} 缺少瓦楞层楞型`,
          ),
        );
      } else if (!isFiniteNumber(parameters.corrugationTakeUpFactors[flute])) {
        reasons.push(
          createParameterErrorReason(
            "CORRUGATION_TAKE_UP_FACTOR_MISSING",
            `${flute} 楞缺少瓦楞伸长系数`,
          ),
        );
      }
    }
  }

  const boardThicknessFlute = resolveBoardThicknessFlute(candidate.fluteType);

  if (!isFiniteNumber(parameters.boardThicknessMm[boardThicknessFlute])) {
    reasons.push(
      createParameterErrorReason(
        "BOARD_THICKNESS_MISSING",
        `${candidate.fluteType} 楞缺少纸板厚度参数`,
      ),
    );
  }
  if (!isFiniteNumber(parameters.strengthThresholds[candidate.layerCount]?.minBctN)) {
    reasons.push(
      createParameterErrorReason(
        "STRENGTH_THRESHOLD_MISSING",
        `${candidate.layerCount} 层缺少强度阈值`,
      ),
    );
  }
  if (!isFiniteNumber(parameters.burstStrengthThresholdsByLayerCount[candidate.layerCount])) {
    reasons.push(
      createParameterErrorReason(
        "BURST_THRESHOLD_MISSING",
        `${candidate.layerCount} 层缺少耐破阈值`,
      ),
    );
  }
  if (!isFiniteNumber(parameters.processingFeeFactorsByLayerCount[candidate.layerCount])) {
    reasons.push(
      createParameterErrorReason(
        "PROCESSING_FEE_FACTOR_MISSING",
        `${candidate.layerCount} 层缺少加工费系数`,
      ),
    );
  }

  return reasons;
}

function resolveCorrugatingFlute(
  layer: CandidateLayer,
  candidate: MatchingCandidate,
): SingleFluteType | undefined {
  if (layer.flute) {
    return layer.flute;
  }

  if (isSingleFlute(candidate.fluteType)) {
    return candidate.fluteType;
  }

  return undefined;
}

function resolveBoardThicknessFlute(fluteType: FluteType): BoardThicknessFluteType {
  if (fluteType === "AB") {
    return "BA";
  }

  return fluteType;
}

function isSingleFlute(fluteType: FluteType): fluteType is SingleFluteType {
  return fluteType === "A" || fluteType === "B" || fluteType === "C" || fluteType === "E";
}

function createDataMissingReason(code: string, message: string): RejectionReason {
  return {
    type: "DATA_MISSING",
    code,
    message,
  };
}

function createParameterErrorReason(code: string, message: string): RejectionReason {
  return {
    type: "PARAMETER_ERROR",
    code,
    message,
  };
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
