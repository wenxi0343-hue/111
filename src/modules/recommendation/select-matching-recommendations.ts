import type {
  CalculationParameters,
  EligibleCandidateEvaluation,
  EvaluateMatchingCandidatesResult,
  FluteType,
  RejectedCandidateEvaluation,
} from "@/modules/calculations/types";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import {
  createCandidateFingerprint,
  sortCandidatesByCostDown,
  sortCandidatesByEnhanced,
  sortCandidatesByStandard,
} from "./scoring";
import {
  GLOBAL_REFERENCE_MESSAGE,
  NO_DISPLAYABLE_REFERENCE_MESSAGE,
  NO_ELIGIBLE_CANDIDATE_MESSAGE,
  REPEATED_RECOMMENDATION_MESSAGE,
  createUnavailableReason,
} from "./reason-messages";
import type {
  RecommendationOptions,
  RecommendationSlot,
  RecommendationStrategy,
  SelectMatchingRecommendationsResult,
} from "./types";

const RECOMMENDATION_TITLES: Record<RecommendationStrategy, RecommendationSlot["title"]> = {
  standard: "标准方案",
  cost_down: "降本方案",
  enhanced: "增强方案",
  economy: "标准方案",
  safety: "增强方案",
  balanced: "降本方案",
};

export function selectMatchingRecommendations(input: {
  evaluation: EvaluateMatchingCandidatesResult;
  parameters: CalculationParameters;
  options?: Partial<RecommendationOptions> | undefined;
  boxSpec?: NormalizedBoxSpec | undefined;
}): SelectMatchingRecommendationsResult {
  const { evaluation, parameters, options = {}, boxSpec } = input;

  if (evaluation.eligibleCandidates.length === 0) {
    return {
      slots: createReferenceSlots(
        evaluation.rejectedCandidates,
        shouldIncludeEnhancedSlot(boxSpec),
      ),
      rejectedSummary: evaluation.rejectedSummary,
      rejectedCandidates: evaluation.rejectedCandidates,
      globalMessages: [GLOBAL_REFERENCE_MESSAGE],
    };
  }

  const standardCandidates = sortCandidatesByStandard(
    evaluation.eligibleCandidates,
    parameters,
    options,
    boxSpec,
  );
  const standardCandidate = standardCandidates[0];
  const costDownCandidates = sortCandidatesByCostDown(
    evaluation.eligibleCandidates,
    standardCandidate,
    parameters,
    options,
    boxSpec,
  );
  const includeEnhanced = shouldIncludeEnhancedSlot(boxSpec);
  const enhancedCandidates = includeEnhanced
    ? sortCandidatesByEnhanced(evaluation.eligibleCandidates, parameters, options, boxSpec)
    : [];
  const usedVisibleFingerprintsByStrategy = new Map<string, RecommendationStrategy>();
  const usedFluteTypesByStrategy = new Map<FluteType, RecommendationStrategy>();
  const slots: RecommendationSlot[] = [
    createRecommendedSlot({
      strategy: "standard",
      candidates: standardCandidates,
      usedVisibleFingerprintsByStrategy,
      usedFluteTypesByStrategy,
    }),
    createRecommendedSlot({
      strategy: "cost_down",
      candidates: costDownCandidates,
      usedVisibleFingerprintsByStrategy,
      usedFluteTypesByStrategy,
    }),
  ];

  if (includeEnhanced) {
    slots.push(
      createRecommendedSlot({
        strategy: "enhanced",
        candidates: enhancedCandidates,
        usedVisibleFingerprintsByStrategy,
        usedFluteTypesByStrategy,
      }),
    );
  }

  return {
    slots,
    rejectedSummary: evaluation.rejectedSummary,
    rejectedCandidates: evaluation.rejectedCandidates,
    globalMessages: [],
  };
}

function createRecommendedSlot(input: {
  strategy: RecommendationStrategy;
  candidates: EligibleCandidateEvaluation[];
  usedVisibleFingerprintsByStrategy: Map<string, RecommendationStrategy>;
  usedFluteTypesByStrategy: Map<FluteType, RecommendationStrategy>;
}): RecommendationSlot {
  const { strategy, candidates, usedVisibleFingerprintsByStrategy, usedFluteTypesByStrategy } =
    input;
  const selectedCandidate =
    candidates.find(
      (candidate) =>
        !usedVisibleFingerprintsByStrategy.has(createVisibleCandidateFingerprint(candidate)) &&
        !usedFluteTypesByStrategy.has(candidate.candidate.fluteType),
    ) ??
    candidates.find(
      (candidate) =>
        !usedVisibleFingerprintsByStrategy.has(createVisibleCandidateFingerprint(candidate)),
    );

  if (!selectedCandidate) {
    const repeatedCandidate = candidates[0];

    if (repeatedCandidate) {
      const fingerprint = createVisibleCandidateFingerprint(repeatedCandidate);

      return {
        strategy,
        title: RECOMMENDATION_TITLES[strategy],
        status: "repeated",
        isOfficialRecommendation: true,
        evaluation: repeatedCandidate,
        messages: [REPEATED_RECOMMENDATION_MESSAGE],
        repeatedFrom: usedVisibleFingerprintsByStrategy.get(fingerprint),
        unavailableReasons: [],
      };
    }

    return {
      strategy,
      title: RECOMMENDATION_TITLES[strategy],
      status: "unavailable",
      isOfficialRecommendation: false,
      messages: [],
      unavailableReasons: createUnavailableReasons(strategy),
    };
  }

  usedVisibleFingerprintsByStrategy.set(
    createVisibleCandidateFingerprint(selectedCandidate),
    strategy,
  );
  usedFluteTypesByStrategy.set(selectedCandidate.candidate.fluteType, strategy);

  return {
    strategy,
    title: RECOMMENDATION_TITLES[strategy],
    status: "recommended",
    isOfficialRecommendation: true,
    evaluation: selectedCandidate,
    messages: [],
    unavailableReasons: [],
  };
}

function createReferenceSlots(
  rejectedCandidates: RejectedCandidateEvaluation[],
  includeEnhanced: boolean,
): RecommendationSlot[] {
  const usedFingerprints = new Set<string>();
  const slots = [
    createReferenceSlot(
      "standard",
      [...rejectedCandidates]
        .filter((candidate) => hasDisplayableReference(candidate) && Boolean(candidate.strength))
        .sort((first, second) => second.strength!.bctN - first.strength!.bctN),
      usedFingerprints,
    ),
    createReferenceSlot(
      "cost_down",
      [...rejectedCandidates]
        .filter((candidate) => hasDisplayableReference(candidate) && Boolean(candidate.cost))
        .sort(
          (first, second) => first.cost!.taxIncludedCostYuan - second.cost!.taxIncludedCostYuan,
        ),
      usedFingerprints,
    ),
  ];

  if (includeEnhanced) {
    slots.push(
      createReferenceSlot(
        "enhanced",
        [...rejectedCandidates]
          .filter(
            (candidate) =>
              hasDisplayableReference(candidate) &&
              Boolean(candidate.cost) &&
              Boolean(candidate.strength),
          )
          .sort((first, second) => {
            const reasonDifference = first.reasons.length - second.reasons.length;

            if (reasonDifference !== 0) {
              return reasonDifference;
            }

            return second.strength!.bctN - first.strength!.bctN;
          }),
        usedFingerprints,
      ),
    );
  }

  return slots;
}

function createReferenceSlot(
  strategy: RecommendationStrategy,
  candidates: RejectedCandidateEvaluation[],
  usedFingerprints: Set<string>,
): RecommendationSlot {
  const selectedCandidate =
    candidates.find((candidate) => !usedFingerprints.has(createCandidateFingerprint(candidate))) ??
    candidates[0];

  if (!selectedCandidate) {
    return {
      strategy,
      title: RECOMMENDATION_TITLES[strategy],
      status: "unavailable",
      isOfficialRecommendation: false,
      messages: [],
      unavailableReasons: [
        createUnavailableReason({
          code: "NO_DISPLAYABLE_REFERENCE",
          message: NO_DISPLAYABLE_REFERENCE_MESSAGE,
          field: strategy,
        }),
      ],
    };
  }

  usedFingerprints.add(createCandidateFingerprint(selectedCandidate));

  return {
    strategy,
    title: RECOMMENDATION_TITLES[strategy],
    status: "reference",
    isOfficialRecommendation: false,
    evaluation: selectedCandidate,
    messages: [],
    unavailableReasons: selectedCandidate.reasons,
  };
}

function createVisibleCandidateFingerprint(
  evaluation: EligibleCandidateEvaluation | RejectedCandidateEvaluation,
): string {
  const linerKeys = evaluation.candidate.layers
    .filter((layer) => layer.role === "outer_liner" || layer.role === "inner_liner")
    .map(createVisibleLayerPaperKey)
    .sort();
  const corrugatingKeys = evaluation.candidate.layers
    .filter((layer) => layer.role === "corrugating")
    .map(createVisibleLayerPaperKey)
    .sort();
  const mediumKeys = evaluation.candidate.layers
    .filter((layer) => layer.role === "medium")
    .map(createVisibleLayerPaperKey)
    .sort();

  return [
    evaluation.candidate.layerCount,
    `liners=${linerKeys.join(",")}`,
    `corrugating=${corrugatingKeys.join(",")}`,
    `medium=${mediumKeys.join(",")}`,
  ].join("|");
}

function createVisibleLayerPaperKey(
  layer: EligibleCandidateEvaluation["candidate"]["layers"][number],
): string {
  return [layer.paper.paperCode, layer.paper.gramWeightGsm ?? ""].join(":");
}

function createUnavailableReasons(strategy: RecommendationStrategy) {
  return [
    createUnavailableReason({
      code: "NO_ELIGIBLE_CANDIDATE",
      message: NO_ELIGIBLE_CANDIDATE_MESSAGE,
      field: strategy,
    }),
  ];
}

function hasDisplayableReference(candidate: RejectedCandidateEvaluation): boolean {
  return Boolean(candidate.area || candidate.strength || candidate.cost);
}

function shouldIncludeEnhancedSlot(boxSpec: NormalizedBoxSpec | undefined): boolean {
  if (!boxSpec) {
    return false;
  }

  const specialText = `${boxSpec.productType} ${boxSpec.specialRequirements.notes ?? ""}`.trim();

  return (
    boxSpec.specialRequirements.dieCutting ||
    boxSpec.specialRequirements.punctureStrengthRequired ||
    boxSpec.stackingRequirement.status === "required" ||
    (boxSpec.specialRequirements.notes?.trim().length ?? 0) > 0 ||
    /贵重|易碎|抗压|强度|堆码|运输|防压/.test(specialText)
  );
}
