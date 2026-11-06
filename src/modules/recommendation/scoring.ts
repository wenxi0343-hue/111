import type {
  CalculationParameters,
  CandidateEvaluation,
  EligibleCandidateEvaluation,
  MatchingCandidate,
  StrengthRequirement,
} from "@/modules/calculations/types";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import { compareCompanyPaperPrinciplePreference } from "./company-paper-principles";
import type { RecommendationOptions } from "./types";

const COST_EPSILON = 0.0001;

const DEFAULT_RECOMMENDATION_OPTIONS: RecommendationOptions = {
  standardTargetMinSurplusRate: 1.1,
  standardTargetMaxSurplusRate: 1.5,
  enhancedTargetMinSurplusRate: 1.5,
  enhancedTargetMaxSurplusRate: 2,
  costDownMinStrengthRatioToStandard: 0.9,
};

export function createCandidateFingerprint(evaluation: CandidateEvaluation): string {
  return createMatchingCandidateFingerprint(evaluation.candidate);
}

export function createMatchingCandidateFingerprint(candidate: MatchingCandidate): string {
  return [
    candidate.layerCount,
    candidate.fluteType,
    ...candidate.layers.map((layer) => [layer.role, layer.flute ?? "", layer.paper.id].join(":")),
  ].join("|");
}

export function calculateWeakestStrengthSurplusRate(
  evaluation: EligibleCandidateEvaluation,
  parameters: CalculationParameters,
): number {
  const strengthRequirement = resolveStrengthRequirementForEvaluation(evaluation, parameters);
  const rates = [
    toSurplusRate(evaluation.strength.bctN, strengthRequirement.minBctN),
    toSurplusRate(evaluation.strength.edgeCrushKnPerM, strengthRequirement.minEdgeCrushKnPerM),
    toSurplusRate(evaluation.strength.burstStrength, strengthRequirement.minBurstStrength),
  ];

  return Math.min(...rates);
}

export function sortCandidatesByStandard(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  boxSpec?: NormalizedBoxSpec | undefined,
): EligibleCandidateEvaluation[] {
  const resolvedOptions = resolveRecommendationOptions(options);

  return [...evaluations].sort((first, second) => {
    const firstSurplus = calculateWeakestStrengthSurplusRate(first, parameters);
    const secondSurplus = calculateWeakestStrengthSurplusRate(second, parameters);
    const flutePreferenceDifference = compareByContextualFlutePreference(first, second, boxSpec);

    if (flutePreferenceDifference !== 0) {
      return flutePreferenceDifference;
    }

    const companyPreferenceDifference = compareByCompanyPaperPrinciples(first, second, boxSpec);

    if (companyPreferenceDifference !== 0) {
      return companyPreferenceDifference;
    }

    const targetDifference = compareByTargetSurplusRange(
      firstSurplus,
      secondSurplus,
      resolvedOptions.standardTargetMinSurplusRate ?? 1.1,
      resolvedOptions.standardTargetMaxSurplusRate ?? 1.5,
    );

    if (targetDifference !== 0) {
      return targetDifference;
    }

    const costDifference = first.cost.taxIncludedCostYuan - second.cost.taxIncludedCostYuan;

    if (Math.abs(costDifference) >= COST_EPSILON) {
      return costDifference;
    }

    return compareByFingerprint(first, second);
  });
}

export function sortCandidatesByCostDown(
  evaluations: EligibleCandidateEvaluation[],
  standard: EligibleCandidateEvaluation | undefined,
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  boxSpec?: NormalizedBoxSpec | undefined,
): EligibleCandidateEvaluation[] {
  const resolvedOptions = resolveRecommendationOptions(options);
  const standardCost = standard?.cost.taxIncludedCostYuan;
  const standardWeakestSurplus = standard
    ? calculateWeakestStrengthSurplusRate(standard, parameters)
    : undefined;
  const minimumStrengthRatio = resolvedOptions.costDownMinStrengthRatioToStandard ?? 0.9;

  const candidates = evaluations.filter((evaluation) => {
    if (
      standard &&
      createMatchingCandidateFingerprint(evaluation.candidate) ===
        createMatchingCandidateFingerprint(standard.candidate)
    ) {
      return false;
    }

    if (
      standardCost !== undefined &&
      evaluation.cost.taxIncludedCostYuan >= standardCost - COST_EPSILON
    ) {
      return false;
    }

    if (standardWeakestSurplus !== undefined) {
      const weakestSurplus = calculateWeakestStrengthSurplusRate(evaluation, parameters);

      return weakestSurplus >= standardWeakestSurplus * minimumStrengthRatio;
    }

    return true;
  });

  return [...candidates].sort((first, second) => {
    const firstLayerReductionRank = getLayerReductionRank(first, standard);
    const secondLayerReductionRank = getLayerReductionRank(second, standard);
    const reductionDifference = firstLayerReductionRank - secondLayerReductionRank;

    if (reductionDifference !== 0) {
      return reductionDifference;
    }

    const companyPreferenceDifference = compareByCompanyPaperPrinciples(first, second, boxSpec);

    if (companyPreferenceDifference !== 0) {
      return companyPreferenceDifference;
    }

    const costDifference = first.cost.taxIncludedCostYuan - second.cost.taxIncludedCostYuan;

    if (Math.abs(costDifference) >= COST_EPSILON) {
      return costDifference;
    }

    return compareByFingerprint(first, second);
  });
}

export function sortCandidatesByEnhanced(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  boxSpec?: NormalizedBoxSpec | undefined,
): EligibleCandidateEvaluation[] {
  const resolvedOptions = resolveRecommendationOptions(options);

  return [...evaluations].sort((first, second) => {
    const firstSurplus = calculateWeakestStrengthSurplusRate(first, parameters);
    const secondSurplus = calculateWeakestStrengthSurplusRate(second, parameters);
    const targetDifference =
      compareByEnhancedFlutePreference(first, second) ||
      compareByTargetSurplusRange(
        firstSurplus,
        secondSurplus,
        resolvedOptions.enhancedTargetMinSurplusRate ?? 1.5,
        resolvedOptions.enhancedTargetMaxSurplusRate ?? 2,
      );

    if (targetDifference !== 0) {
      return targetDifference;
    }

    const companyPreferenceDifference = compareByCompanyPaperPrinciples(first, second, boxSpec);

    if (companyPreferenceDifference !== 0) {
      return companyPreferenceDifference;
    }

    const costDifference = first.cost.taxIncludedCostYuan - second.cost.taxIncludedCostYuan;

    if (Math.abs(costDifference) >= COST_EPSILON) {
      return costDifference;
    }

    return compareByFingerprint(first, second);
  });
}

function resolveRecommendationOptions(
  options: Partial<RecommendationOptions>,
): RecommendationOptions {
  return {
    ...DEFAULT_RECOMMENDATION_OPTIONS,
    ...options,
  };
}

function compareByFingerprint(
  first: EligibleCandidateEvaluation,
  second: EligibleCandidateEvaluation,
): number {
  return createCandidateFingerprint(first).localeCompare(createCandidateFingerprint(second));
}

function compareByCompanyPaperPrinciples(
  first: EligibleCandidateEvaluation,
  second: EligibleCandidateEvaluation,
  boxSpec: NormalizedBoxSpec | undefined,
): number {
  if (!boxSpec) {
    return 0;
  }

  return compareCompanyPaperPrinciplePreference(first.candidate, second.candidate, boxSpec);
}

function toSurplusRate(value: number, threshold: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold <= 0) {
    return 0;
  }

  return value / threshold;
}

function compareByTargetSurplusRange(
  firstSurplus: number,
  secondSurplus: number,
  min: number,
  max: number,
): number {
  const firstInRange = firstSurplus >= min && firstSurplus <= max;
  const secondInRange = secondSurplus >= min && secondSurplus <= max;

  if (firstInRange !== secondInRange) {
    return firstInRange ? -1 : 1;
  }

  const target = (min + max) / 2;
  const firstDistance = Math.abs(firstSurplus - target);
  const secondDistance = Math.abs(secondSurplus - target);
  const distanceDifference = firstDistance - secondDistance;

  if (Math.abs(distanceDifference) >= COST_EPSILON) {
    return distanceDifference;
  }

  return firstSurplus - secondSurplus;
}

function compareByContextualFlutePreference(
  first: EligibleCandidateEvaluation,
  second: EligibleCandidateEvaluation,
  boxSpec: NormalizedBoxSpec | undefined,
): number {
  return (
    getContextualFlutePreferenceRank(first.candidate.fluteType, boxSpec) -
    getContextualFlutePreferenceRank(second.candidate.fluteType, boxSpec)
  );
}

function compareByEnhancedFlutePreference(
  first: EligibleCandidateEvaluation,
  second: EligibleCandidateEvaluation,
): number {
  return (
    getEnhancedFlutePreferenceRank(first.candidate.fluteType) -
    getEnhancedFlutePreferenceRank(second.candidate.fluteType)
  );
}

function getContextualFlutePreferenceRank(
  fluteType: MatchingCandidate["fluteType"],
  boxSpec: NormalizedBoxSpec | undefined,
): number {
  if (boxSpec && isLightSmallBox(boxSpec)) {
    return getRank(fluteType, ["E", "B", "C", "A", "BE", "BC", "AB", "BA", "AC", "BAC"]);
  }

  if (boxSpec && hasHighRiskRequirement(boxSpec)) {
    return getRank(fluteType, ["C", "A", "B", "BC", "AC", "BA", "AB", "BAC", "E", "BE"]);
  }

  return getRank(fluteType, ["B", "C", "A", "BC", "AB", "BA", "AC", "BAC", "E", "BE"]);
}

function getEnhancedFlutePreferenceRank(fluteType: MatchingCandidate["fluteType"]): number {
  return getRank(fluteType, ["C", "A", "BC", "AC", "BA", "AB", "BAC", "B", "E", "BE"]);
}

function getRank(
  fluteType: MatchingCandidate["fluteType"],
  flutes: MatchingCandidate["fluteType"][],
): number {
  const index = flutes.indexOf(fluteType);

  return index === -1 ? flutes.length : index;
}

function resolveStrengthRequirementForEvaluation(
  evaluation: EligibleCandidateEvaluation,
  parameters: CalculationParameters,
): StrengthRequirement {
  if (evaluation.strength.requirement) {
    return evaluation.strength.requirement;
  }

  const strengthThreshold = parameters.strengthThresholds[evaluation.candidate.layerCount];

  return {
    minBctN: strengthThreshold.minBctN,
    minEdgeCrushKnPerM: strengthThreshold.minEdgeCrushKnPerM,
    minBurstStrength:
      parameters.burstStrengthThresholdsByLayerCount[evaluation.candidate.layerCount],
  };
}

function isLightSmallBox(boxSpec: NormalizedBoxSpec): boolean {
  return (
    boxSpec.productWeightKg <= 5 &&
    boxSpec.lengthMm <= 300 &&
    boxSpec.widthMm <= 200 &&
    boxSpec.heightMm <= 150
  );
}

function hasHighRiskRequirement(boxSpec: NormalizedBoxSpec): boolean {
  const text = `${boxSpec.productType} ${boxSpec.specialRequirements.notes ?? ""}`;

  return (
    boxSpec.specialRequirements.punctureStrengthRequired ||
    boxSpec.stackingRequirement.status === "required" ||
    /贵重|易碎|抗压|强度|堆码|运输|防压/.test(text)
  );
}

function getLayerReductionRank(
  candidate: EligibleCandidateEvaluation,
  standard: EligibleCandidateEvaluation | undefined,
): number {
  if (!standard) {
    return 0;
  }

  const reductions = candidate.candidate.layers.map((layer, index) => {
    const standardLayer = standard.candidate.layers[index];
    const candidateWeight = layer.paper.gramWeightGsm;
    const standardWeight = standardLayer?.paper.gramWeightGsm;

    if (
      typeof candidateWeight !== "number" ||
      typeof standardWeight !== "number" ||
      !Number.isFinite(candidateWeight) ||
      !Number.isFinite(standardWeight)
    ) {
      return 0;
    }

    return standardWeight - candidateWeight;
  });
  const hasLargeReduction = reductions.some((reduction) => reduction > 15);

  if (hasLargeReduction) {
    return 3;
  }

  const linerReduced = candidate.candidate.layers.some((layer, index) => {
    if (layer.role !== "outer_liner" && layer.role !== "inner_liner") {
      return false;
    }

    return (reductions[index] ?? 0) > 0;
  });

  if (linerReduced) {
    return 2;
  }

  const corrugatingOrMediumReduced = candidate.candidate.layers.some((layer, index) => {
    if (layer.role !== "corrugating" && layer.role !== "medium") {
      return false;
    }

    return (reductions[index] ?? 0) > 0;
  });

  return corrugatingOrMediumReduced ? 0 : 1;
}
