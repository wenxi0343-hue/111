import type {
  CalculationParameters,
  EligibleCandidateEvaluation,
  EvaluateMatchingCandidatesResult,
  RejectedCandidateEvaluation,
} from "@/modules/calculations/types";

import {
  calculateSafetySurplusRate,
  createCandidateFingerprint,
  sortCandidatesByBalanced,
  sortCandidatesByEconomy,
  sortCandidatesBySafety,
} from "./scoring";
import {
  GLOBAL_REFERENCE_MESSAGE,
  NO_DISPLAYABLE_REFERENCE_MESSAGE,
  NO_ELIGIBLE_CANDIDATE_MESSAGE,
  REPEATED_RECOMMENDATION_MESSAGE,
  SAFETY_SURPLUS_OVER_LIMIT_MESSAGE,
  createUnavailableReason,
} from "./reason-messages";
import type {
  RecommendationOptions,
  RecommendationSlot,
  RecommendationStrategy,
  SelectMatchingRecommendationsResult,
} from "./types";

const RECOMMENDATION_TITLES: Record<RecommendationStrategy, RecommendationSlot["title"]> = {
  economy: "经济型",
  safety: "安全型",
  balanced: "均衡型",
};
const DEFAULT_MAX_SAFETY_SURPLUS_RATE = 2;

export function selectMatchingRecommendations(input: {
  evaluation: EvaluateMatchingCandidatesResult;
  parameters: CalculationParameters;
  options?: Partial<RecommendationOptions> | undefined;
}): SelectMatchingRecommendationsResult {
  const { evaluation, parameters, options = {} } = input;

  if (evaluation.eligibleCandidates.length === 0) {
    return {
      slots: createReferenceSlots(evaluation.rejectedCandidates),
      rejectedSummary: evaluation.rejectedSummary,
      rejectedCandidates: evaluation.rejectedCandidates,
      globalMessages: [GLOBAL_REFERENCE_MESSAGE],
    };
  }

  const economyCandidates = sortCandidatesByEconomy(evaluation.eligibleCandidates, parameters);
  const safetyCandidates = sortCandidatesBySafety(
    evaluation.eligibleCandidates,
    parameters,
    options,
  );
  const balancedCandidates = sortCandidatesByBalanced(
    evaluation.eligibleCandidates,
    parameters,
    options,
  );
  const usedFingerprintsByStrategy = new Map<string, RecommendationStrategy>();

  return {
    slots: [
      createRecommendedSlot({
        strategy: "economy",
        candidates: economyCandidates,
        eligibleCandidates: evaluation.eligibleCandidates,
        parameters,
        options,
        usedFingerprintsByStrategy,
      }),
      createRecommendedSlot({
        strategy: "safety",
        candidates: safetyCandidates,
        eligibleCandidates: evaluation.eligibleCandidates,
        parameters,
        options,
        usedFingerprintsByStrategy,
      }),
      createRecommendedSlot({
        strategy: "balanced",
        candidates: balancedCandidates,
        eligibleCandidates: evaluation.eligibleCandidates,
        parameters,
        options,
        usedFingerprintsByStrategy,
      }),
    ],
    rejectedSummary: evaluation.rejectedSummary,
    rejectedCandidates: evaluation.rejectedCandidates,
    globalMessages: [],
  };
}

function createRecommendedSlot(input: {
  strategy: RecommendationStrategy;
  candidates: EligibleCandidateEvaluation[];
  eligibleCandidates: EligibleCandidateEvaluation[];
  parameters: CalculationParameters;
  options: Partial<RecommendationOptions>;
  usedFingerprintsByStrategy: Map<string, RecommendationStrategy>;
}): RecommendationSlot {
  const {
    strategy,
    candidates,
    eligibleCandidates,
    parameters,
    options,
    usedFingerprintsByStrategy,
  } = input;
  const selectedCandidate = candidates.find(
    (candidate) => !usedFingerprintsByStrategy.has(createCandidateFingerprint(candidate)),
  );

  if (!selectedCandidate) {
    const repeatedCandidate = candidates[0];

    if (repeatedCandidate) {
      const fingerprint = createCandidateFingerprint(repeatedCandidate);

      return {
        strategy,
        title: RECOMMENDATION_TITLES[strategy],
        status: "repeated",
        isOfficialRecommendation: true,
        evaluation: repeatedCandidate,
        messages: [REPEATED_RECOMMENDATION_MESSAGE],
        repeatedFrom: usedFingerprintsByStrategy.get(fingerprint),
        unavailableReasons: [],
      };
    }

    return {
      strategy,
      title: RECOMMENDATION_TITLES[strategy],
      status: "unavailable",
      isOfficialRecommendation: false,
      messages: [],
      unavailableReasons: createUnavailableReasons({
        strategy,
        eligibleCandidates,
        parameters,
        options,
      }),
    };
  }

  usedFingerprintsByStrategy.set(createCandidateFingerprint(selectedCandidate), strategy);

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
): [RecommendationSlot, RecommendationSlot, RecommendationSlot] {
  const usedFingerprints = new Set<string>();

  return [
    createReferenceSlot(
      "economy",
      [...rejectedCandidates]
        .filter((candidate) => hasDisplayableReference(candidate) && Boolean(candidate.cost))
        .sort((first, second) => first.cost!.taxIncludedCostYuan - second.cost!.taxIncludedCostYuan),
      usedFingerprints,
    ),
    createReferenceSlot(
      "safety",
      [...rejectedCandidates]
        .filter((candidate) => hasDisplayableReference(candidate) && Boolean(candidate.strength))
        .sort((first, second) => second.strength!.bctN - first.strength!.bctN),
      usedFingerprints,
    ),
    createReferenceSlot(
      "balanced",
      [...rejectedCandidates]
        .filter(
          (candidate) =>
            hasDisplayableReference(candidate) && Boolean(candidate.cost) && Boolean(candidate.strength),
        )
        .sort((first, second) => {
          const reasonDifference = first.reasons.length - second.reasons.length;

          if (reasonDifference !== 0) {
            return reasonDifference;
          }

          return first.cost!.taxIncludedCostYuan - second.cost!.taxIncludedCostYuan;
        }),
      usedFingerprints,
    ),
  ];
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

function createUnavailableReasons(input: {
  strategy: RecommendationStrategy;
  eligibleCandidates: EligibleCandidateEvaluation[];
  parameters: CalculationParameters;
  options: Partial<RecommendationOptions>;
}) {
  const { strategy, eligibleCandidates, parameters, options } = input;

  if (
    strategy === "safety" &&
    eligibleCandidates.every(
      (candidate) =>
        calculateSafetySurplusRate(candidate, parameters) >
        (options.maxSafetySurplusRate ?? DEFAULT_MAX_SAFETY_SURPLUS_RATE),
    )
  ) {
    return [
      createUnavailableReason({
        code: "SAFETY_SURPLUS_OVER_LIMIT",
        message: SAFETY_SURPLUS_OVER_LIMIT_MESSAGE,
        field: strategy,
      }),
    ];
  }

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
