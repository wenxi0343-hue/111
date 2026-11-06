import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { LayerCount, MatchingCandidate } from "@/modules/calculations/types";

const FIVE_LAYER_MIN_WEIGHT_KG_EXCLUSIVE = 20;
const SEVEN_LAYER_MIN_WEIGHT_KG_EXCLUSIVE = 30;

export function getApplicableLayerCounts(boxSpec: NormalizedBoxSpec): LayerCount[] {
  if (boxSpec.productWeightKg > SEVEN_LAYER_MIN_WEIGHT_KG_EXCLUSIVE) {
    return [7];
  }

  if (boxSpec.productWeightKg > FIVE_LAYER_MIN_WEIGHT_KG_EXCLUSIVE) {
    return [5];
  }

  return [3];
}

export function filterCandidatesByApplicableLayerCount(input: {
  boxSpec: NormalizedBoxSpec;
  candidates: MatchingCandidate[];
}): MatchingCandidate[] {
  const applicableLayerCounts = new Set(getApplicableLayerCounts(input.boxSpec));

  return input.candidates.filter((candidate) => applicableLayerCounts.has(candidate.layerCount));
}
