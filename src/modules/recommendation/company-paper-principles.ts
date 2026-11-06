import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { CandidateLayer, MatchingCandidate } from "@/modules/calculations/types";

export type CompanyPaperPrincipleViolationCode =
  | "INNER_LINER_HEAVIER_THAN_OUTER"
  | "LINER_WEIGHT_GAP_TOO_LARGE"
  | "CORRUGATING_NOT_LOWER_THAN_LINER"
  | "CORRUGATING_RATIO_OUT_OF_RANGE"
  | "DIE_CUTTING_THREE_LAYER_LINER_TOO_LOW"
  | "DIE_CUTTING_FIVE_LAYER_LINER_TOO_LOW";

export interface CompanyPaperPrincipleViolation {
  code: CompanyPaperPrincipleViolationCode;
  message: string;
}

const THREE_LAYER_DIE_CUTTING_MIN_LINER_GSM = 190;
const FIVE_LAYER_DIE_CUTTING_MIN_LINER_GSM = 200;
const PREFERRED_OUTER_INNER_LINER_WEIGHT_GAP_GSM = 10;
const MAX_OUTER_INNER_LINER_WEIGHT_GAP_GSM = 20;
const OVERBUILT_LINER_WEIGHT_GSM = 300;
const HEAVY_ORDINARY_FIVE_LAYER_MIN_LINER_GSM = 160;
const MIN_CORRUGATING_TO_LINER_RATIO = 0.6;
const MAX_CORRUGATING_TO_LINER_RATIO = 0.8;

export function getCompanyPaperPrincipleViolations(input: {
  boxSpec: NormalizedBoxSpec;
  candidate: MatchingCandidate;
}): CompanyPaperPrincipleViolation[] {
  const linerWeights = getLinerWeights(input.candidate);
  const corrugatingWeights = getWeightsByRole(input.candidate, "corrugating");
  const linerPair = getOuterInnerLinerWeights(input.candidate);
  const violations: CompanyPaperPrincipleViolation[] = [];

  if (linerPair && linerPair.innerWeightGsm > linerPair.outerWeightGsm) {
    violations.push({
      code: "INNER_LINER_HEAVIER_THAN_OUTER",
      message: "里纸克重不应高于面纸克重",
    });
  }

  if (
    linerPair &&
    linerPair.outerWeightGsm - linerPair.innerWeightGsm > MAX_OUTER_INNER_LINER_WEIGHT_GAP_GSM
  ) {
    violations.push({
      code: "LINER_WEIGHT_GAP_TOO_LARGE",
      message: "面纸和里纸克重差不应超过 10g",
    });
  }

  if (
    linerWeights.length > 0 &&
    corrugatingWeights.some((corrugatingWeight) =>
      linerWeights.some((linerWeight) => corrugatingWeight >= linerWeight),
    )
  ) {
    violations.push({
      code: "CORRUGATING_NOT_LOWER_THAN_LINER",
      message: "瓦纸克重必须低于面纸和里纸",
    });
  }

  if (hasCorrugatingRatioOutOfRange(linerWeights, corrugatingWeights)) {
    violations.push({
      code: "CORRUGATING_RATIO_OUT_OF_RANGE",
      message: "Corrugating paper weight must be 60%-80% of the lightest liner paper",
    });
  }

  if (input.boxSpec.specialRequirements.dieCutting) {
    const minLinerWeight = Math.min(...linerWeights);

    if (
      input.candidate.layerCount === 3 &&
      Number.isFinite(minLinerWeight) &&
      minLinerWeight < THREE_LAYER_DIE_CUTTING_MIN_LINER_GSM
    ) {
      violations.push({
        code: "DIE_CUTTING_THREE_LAYER_LINER_TOO_LOW",
        message: "模切三层纸箱面纸和里纸不得低于190g",
      });
    }

    if (
      input.candidate.layerCount === 5 &&
      Number.isFinite(minLinerWeight) &&
      minLinerWeight < FIVE_LAYER_DIE_CUTTING_MIN_LINER_GSM
    ) {
      violations.push({
        code: "DIE_CUTTING_FIVE_LAYER_LINER_TOO_LOW",
        message: "模切五层纸箱面纸和里纸不得低于200g",
      });
    }
  }

  return violations;
}

export function isCompanyPaperPrincipleCompliant(input: {
  boxSpec: NormalizedBoxSpec;
  candidate: MatchingCandidate;
}): boolean {
  return getCompanyPaperPrincipleViolations(input).length === 0;
}

export function filterCompanyPaperPrincipleCandidates(input: {
  boxSpec: NormalizedBoxSpec;
  candidates: MatchingCandidate[];
}): MatchingCandidate[] {
  return input.candidates.filter((candidate) =>
    isCompanyPaperPrincipleCompliant({ boxSpec: input.boxSpec, candidate }),
  );
}

export function compareCompanyPaperPrinciplePreference(
  left: MatchingCandidate,
  right: MatchingCandidate,
  boxSpec: NormalizedBoxSpec,
): number {
  const linerWeightTierDifference =
    getLinerWeightPreferenceTier(left) - getLinerWeightPreferenceTier(right);

  if (linerWeightTierDifference !== 0) {
    return linerWeightTierDifference;
  }

  const linerBalanceDifference =
    getLinerBalancePreferenceScore(left) - getLinerBalancePreferenceScore(right);

  if (Number.isFinite(linerBalanceDifference) && Math.abs(linerBalanceDifference) > 0.0001) {
    return linerBalanceDifference;
  }

  const corrugatingNotLowerDifference =
    getCorrugatingNotLowerPreferenceTier(left) -
    getCorrugatingNotLowerPreferenceTier(right);

  if (corrugatingNotLowerDifference !== 0) {
    return corrugatingNotLowerDifference;
  }

  const commonFiveLayerLinerDifference =
    getCommonFiveLayerLinerPreferenceTier(left, boxSpec) -
    getCommonFiveLayerLinerPreferenceTier(right, boxSpec);

  if (commonFiveLayerLinerDifference !== 0) {
    return commonFiveLayerLinerDifference;
  }

  const totalGramWeightPreferenceDifference =
    getTotalGramWeightPreferenceTier(left, boxSpec) -
    getTotalGramWeightPreferenceTier(right, boxSpec);

  if (totalGramWeightPreferenceDifference !== 0) {
    return totalGramWeightPreferenceDifference;
  }

  const corrugatingPreferenceDifference =
    getCorrugatingPreferenceRank(left) - getCorrugatingPreferenceRank(right);

  if (corrugatingPreferenceDifference !== 0) {
    return corrugatingPreferenceDifference;
  }

  if (!boxSpec.specialRequirements.punctureStrengthRequired) {
    const mediumDifference = getAverageMediumWeight(left) - getAverageMediumWeight(right);

    if (Number.isFinite(mediumDifference) && Math.abs(mediumDifference) > 0.0001) {
      return mediumDifference;
    }
  }

  return 0;
}

function getTotalGramWeightPreferenceTier(
  candidate: MatchingCandidate,
  boxSpec: NormalizedBoxSpec,
): number {
  if (
    candidate.layerCount !== 5 ||
    candidate.fluteType !== "BC" ||
    boxSpec.specialRequirements.punctureStrengthRequired ||
    boxSpec.stackingRequirement.status === "required" ||
    /贵重|易碎|抗压|强度|堆码|运输|防压/.test(
      `${boxSpec.productType} ${boxSpec.specialRequirements.notes ?? ""}`,
    )
  ) {
    return 0;
  }

  const totalGramWeight = candidate.layers.reduce((sum, layer) => {
    const gramWeight = layer.paper.gramWeightGsm;

    return typeof gramWeight === "number" && Number.isFinite(gramWeight)
      ? sum + gramWeight
      : sum;
  }, 0);

  if (totalGramWeight <= 0) {
    return 0;
  }

  return totalGramWeight <= 920 ? 0 : 1;
}

function getCommonFiveLayerLinerPreferenceTier(
  candidate: MatchingCandidate,
  boxSpec: NormalizedBoxSpec,
): number {
  if (
    candidate.layerCount !== 5 ||
    candidate.fluteType !== "BC" ||
    boxSpec.specialRequirements.punctureStrengthRequired ||
    boxSpec.stackingRequirement.status === "required"
  ) {
    return 0;
  }

  const linerPair = getOuterInnerLinerWeights(candidate);

  if (!linerPair) {
    return 0;
  }

  return linerPair.outerWeightGsm >= HEAVY_ORDINARY_FIVE_LAYER_MIN_LINER_GSM &&
    linerPair.innerWeightGsm >= HEAVY_ORDINARY_FIVE_LAYER_MIN_LINER_GSM
    ? 0
    : 1;
}

export function isOuterInnerLinerWeightCompliant(input: {
  outerWeightGsm: number | null | undefined;
  innerWeightGsm: number | null | undefined;
}): boolean {
  const { outerWeightGsm, innerWeightGsm } = input;

  if (!isFiniteNumber(outerWeightGsm) || !isFiniteNumber(innerWeightGsm)) {
    return true;
  }

  return (
    outerWeightGsm >= innerWeightGsm &&
    outerWeightGsm - innerWeightGsm <= MAX_OUTER_INNER_LINER_WEIGHT_GAP_GSM
  );
}

function getLinerBalancePreferenceScore(candidate: MatchingCandidate): number {
  const linerPair = getOuterInnerLinerWeights(candidate);

  if (!linerPair) {
    return Number.POSITIVE_INFINITY;
  }

  if (
    !isOuterInnerLinerWeightCompliant({
      outerWeightGsm: linerPair.outerWeightGsm,
      innerWeightGsm: linerPair.innerWeightGsm,
    })
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const gap = linerPair.outerWeightGsm - linerPair.innerWeightGsm;

  return gap <= PREFERRED_OUTER_INNER_LINER_WEIGHT_GAP_GSM
    ? gap
    : PREFERRED_OUTER_INNER_LINER_WEIGHT_GAP_GSM + gap;
}

function getLinerWeightPreferenceTier(candidate: MatchingCandidate): number {
  const linerWeights = getLinerWeights(candidate);

  if (linerWeights.length === 0) {
    return 1;
  }

  return Math.max(...linerWeights) >= OVERBUILT_LINER_WEIGHT_GSM ? 1 : 0;
}

function getCorrugatingPreferenceRank(candidate: MatchingCandidate): number {
  const linerWeights = getLinerWeights(candidate);
  const corrugatingWeights = getWeightsByRole(candidate, "corrugating");

  if (linerWeights.length === 0 || corrugatingWeights.length === 0) {
    return 1;
  }

  const minLinerWeight = Math.min(...linerWeights);

  return corrugatingWeights.every((corrugatingWeight) => {
    const ratio = corrugatingWeight / minLinerWeight;

    return ratio >= MIN_CORRUGATING_TO_LINER_RATIO && ratio <= MAX_CORRUGATING_TO_LINER_RATIO;
  })
    ? 0
    : 1;
}

function getCorrugatingNotLowerPreferenceTier(candidate: MatchingCandidate): number {
  const linerWeights = getLinerWeights(candidate);
  const corrugatingWeights = getWeightsByRole(candidate, "corrugating");

  if (linerWeights.length === 0 || corrugatingWeights.length === 0) {
    return 0;
  }

  const minLinerWeight = Math.min(...linerWeights);

  return corrugatingWeights.some((corrugatingWeight) => corrugatingWeight >= minLinerWeight)
    ? 1
    : 0;
}

function hasCorrugatingRatioOutOfRange(
  linerWeights: number[],
  corrugatingWeights: number[],
): boolean {
  if (linerWeights.length === 0 || corrugatingWeights.length === 0) {
    return false;
  }

  const minLinerWeight = Math.min(...linerWeights);

  return corrugatingWeights.some((corrugatingWeight) => {
    if (corrugatingWeight >= minLinerWeight) {
      return false;
    }

    const ratio = corrugatingWeight / minLinerWeight;

    return ratio < MIN_CORRUGATING_TO_LINER_RATIO || ratio > MAX_CORRUGATING_TO_LINER_RATIO;
  });
}

function getAverageMediumWeight(candidate: MatchingCandidate): number {
  const mediumWeights = getWeightsByRole(candidate, "medium");

  if (mediumWeights.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return mediumWeights.reduce((sum, weight) => sum + weight, 0) / mediumWeights.length;
}

function getLinerWeights(candidate: MatchingCandidate): number[] {
  return candidate.layers
    .filter((layer) => layer.role === "outer_liner" || layer.role === "inner_liner")
    .map(getLayerGramWeight)
    .filter(isFiniteNumber);
}

function getOuterInnerLinerWeights(
  candidate: MatchingCandidate,
): { outerWeightGsm: number; innerWeightGsm: number } | undefined {
  const outerWeightGsm = candidate.layers.find((layer) => layer.role === "outer_liner")?.paper
    .gramWeightGsm;
  const innerWeightGsm = candidate.layers.find((layer) => layer.role === "inner_liner")?.paper
    .gramWeightGsm;

  if (!isFiniteNumber(outerWeightGsm) || !isFiniteNumber(innerWeightGsm)) {
    return undefined;
  }

  return { outerWeightGsm, innerWeightGsm };
}

function getWeightsByRole(candidate: MatchingCandidate, role: CandidateLayer["role"]): number[] {
  return candidate.layers
    .filter((layer) => layer.role === role)
    .map(getLayerGramWeight)
    .filter(isFiniteNumber);
}

function getLayerGramWeight(layer: CandidateLayer): number | undefined {
  return layer.paper.gramWeightGsm ?? undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
