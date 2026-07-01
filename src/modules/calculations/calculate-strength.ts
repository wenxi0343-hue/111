import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import type {
  BoardAreaResult,
  CalculationParameters,
  CandidateLayer,
  FluteType,
  MatchingCandidate,
  RejectionReason,
  SingleFluteType,
  StrengthResult,
} from "./types";

export function calculateStrength(input: {
  boxSpec: NormalizedBoxSpec;
  candidate: MatchingCandidate;
  area: BoardAreaResult;
  parameters: CalculationParameters;
}): StrengthResult {
  const { candidate, area, parameters } = input;
  const burstStrength = calculateBurstStrength(candidate.layers);
  const edgeCrushNPerM = calculateEdgeCrush(candidate, parameters);
  const edgeCrushKnPerM = edgeCrushNPerM / 1000;
  const bctN = calculateBct({
    edgeCrushNPerM,
    area,
    fluteType: candidate.fluteType,
    parameters,
  });
  const reasons = buildStrengthReasons({
    burstStrength,
    edgeCrushKnPerM,
    bctN,
    candidate,
    parameters,
  });

  return {
    burstStrength,
    edgeCrushNPerM,
    edgeCrushKnPerM,
    bctN,
    isQualified: reasons.length === 0,
    reasons,
  };
}

function calculateBurstStrength(layers: CandidateLayer[]): number {
  const total = layers.reduce((sum, layer) => {
    if (layer.role === "corrugating") {
      return sum;
    }

    return sum + Math.round(readNumber(layer.paper.burstIndex) * readNumber(layer.paper.gramWeightGsm));
  }, 0);

  return Math.round(total * 0.95);
}

function calculateEdgeCrush(
  candidate: MatchingCandidate,
  parameters: CalculationParameters,
): number {
  const total = candidate.layers.reduce((sum, layer) => {
    const ringCrush = readNumber(layer.paper.ringCrushIndex);
    const gramWeight = readNumber(layer.paper.gramWeightGsm);
    const takeUpFactor =
      layer.role === "corrugating"
        ? parameters.corrugationTakeUpFactors[resolveCorrugatingFlute(layer, candidate)]
        : 1;

    return sum + Math.round(ringCrush * gramWeight * takeUpFactor);
  }, 0);

  return Math.round(total * parameters.edgeCrushCorrectionFactor);
}

function calculateBct({
  edgeCrushNPerM,
  area,
  fluteType,
  parameters,
}: {
  edgeCrushNPerM: number;
  area: BoardAreaResult;
  fluteType: FluteType;
  parameters: CalculationParameters;
}): number {
  const thickness = parameters.boardThicknessMm[resolveBoardThicknessFlute(fluteType)];
  const innerPerimeterMm = (area.innerLengthMm + area.innerWidthMm) * 2;

  return Math.round(
    5.874 * edgeCrushNPerM * Math.sqrt((thickness * innerPerimeterMm) / 1_000_000),
  );
}

function buildStrengthReasons({
  burstStrength,
  edgeCrushKnPerM,
  bctN,
  candidate,
  parameters,
}: {
  burstStrength: number;
  edgeCrushKnPerM: number;
  bctN: number;
  candidate: MatchingCandidate;
  parameters: CalculationParameters;
}): RejectionReason[] {
  const threshold = parameters.strengthThresholds[candidate.layerCount];
  const reasons: RejectionReason[] = [];

  if (bctN < threshold.minBctN) {
    reasons.push(createStrengthReason("BCT_TOO_LOW", `空箱抗压不足，低于 ${threshold.minBctN}N`));
  }

  if (edgeCrushKnPerM < threshold.minEdgeCrushKnPerM) {
    reasons.push(
      createStrengthReason("ECT_TOO_LOW", `边压不足，低于 ${threshold.minEdgeCrushKnPerM}kN/m`),
    );
  }

  if (burstStrength < parameters.burstStrengthThresholdsByLayerCount[candidate.layerCount]) {
    reasons.push(createStrengthReason("BURST_TOO_LOW", "耐破不足"));
  }

  return reasons;
}

function createStrengthReason(code: string, message: string): RejectionReason {
  return {
    type: "STRENGTH_UNQUALIFIED",
    code,
    message,
  };
}

function resolveCorrugatingFlute(
  layer: CandidateLayer,
  candidate: MatchingCandidate,
): SingleFluteType {
  if (layer.flute) {
    return layer.flute;
  }

  if (candidate.fluteType === "A" || candidate.fluteType === "B" || candidate.fluteType === "C" || candidate.fluteType === "E") {
    return candidate.fluteType;
  }

  throw new Error(`Corrugating layer ${layer.paper.paperCode} is missing flute type`);
}

function resolveBoardThicknessFlute(fluteType: FluteType): Exclude<FluteType, "AB"> {
  if (fluteType === "AB") {
    return "BA";
  }

  return fluteType;
}

function readNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Strength calculation requires complete numeric paper data");
  }

  return value;
}
