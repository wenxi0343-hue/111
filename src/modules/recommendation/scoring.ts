import type {
  CalculationParameters,
  CandidateEvaluation,
  EligibleCandidateEvaluation,
  MatchingCandidate,
} from "@/modules/calculations/types";

import type {
  BalancedCandidateScore,
  HistoricalHabitSelectionContext,
  RecommendationHistoricalHabitInfo,
  RecommendationOptions,
} from "./types";

const COST_EPSILON = 0.0001;

const DEFAULT_RECOMMENDATION_OPTIONS: RecommendationOptions = {
  balancedCostWeight: 0.5,
  balancedSafetyWeight: 0.5,
  maxSafetySurplusRate: 2,
};

export function createCandidateFingerprint(evaluation: CandidateEvaluation): string {
  return createMatchingCandidateFingerprint(evaluation.candidate);
}

export function createMatchingCandidateFingerprint(candidate: MatchingCandidate): string {
  return [
    candidate.layerCount,
    candidate.fluteType,
    ...candidate.layers.map((layer) =>
      [layer.role, layer.flute ?? "", layer.paper.id].join(":"),
    ),
  ].join("|");
}

export function calculateSafetySurplusRate(
  evaluation: EligibleCandidateEvaluation,
  parameters: CalculationParameters,
): number {
  const threshold = parameters.strengthThresholds[evaluation.candidate.layerCount].minBctN;

  if (!Number.isFinite(threshold) || threshold <= 0) {
    return 0;
  }

  return evaluation.strength.bctN / threshold;
}

export function sortCandidatesByEconomy(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  historicalHabitContext?: HistoricalHabitSelectionContext | undefined,
): EligibleCandidateEvaluation[] {
  return sortHistoricalMatchesFirst(evaluations, historicalHabitContext, (items) =>
    [...items].sort((first, second) => {
    const costDifference = first.cost.taxIncludedCostYuan - second.cost.taxIncludedCostYuan;

    if (Math.abs(costDifference) >= COST_EPSILON) {
      return costDifference;
    }

    const firstSurplusRate = calculateSafetySurplusRate(first, parameters);
    const secondSurplusRate = calculateSafetySurplusRate(second, parameters);
    const surplusDifference = firstSurplusRate - secondSurplusRate;

    if (Math.abs(surplusDifference) >= COST_EPSILON) {
      return surplusDifference;
    }

    return compareByFingerprint(first, second);
    }),
  );
}

export function sortCandidatesBySafety(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  historicalHabitContext?: HistoricalHabitSelectionContext | undefined,
): EligibleCandidateEvaluation[] {
  const resolvedOptions = resolveRecommendationOptions(options);

  const candidatesUnderLimit = evaluations
    .filter(
      (evaluation) =>
        calculateSafetySurplusRate(evaluation, parameters) <= resolvedOptions.maxSafetySurplusRate,
    )
  return sortHistoricalMatchesFirst(candidatesUnderLimit, historicalHabitContext, (items) =>
    [...items].sort((first, second) => {
      const surplusDifference =
        calculateSafetySurplusRate(second, parameters) - calculateSafetySurplusRate(first, parameters);

      if (Math.abs(surplusDifference) >= COST_EPSILON) {
        return surplusDifference;
      }

      const costDifference = first.cost.taxIncludedCostYuan - second.cost.taxIncludedCostYuan;

      if (Math.abs(costDifference) >= COST_EPSILON) {
        return costDifference;
      }

      return compareByFingerprint(first, second);
    }),
  );
}

export function scoreBalancedCandidates(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  historicalHabitContext?: HistoricalHabitSelectionContext | undefined,
): BalancedCandidateScore[] {
  const resolvedOptions = resolveRecommendationOptions(
    historicalHabitContext
      ? {
          balancedCostWeight: 0.3,
          balancedSafetyWeight: 0.3,
          historicalHabitWeight: 0.4,
          ...options,
        }
      : options,
  );
  const costs = evaluations.map((evaluation) => evaluation.cost.taxIncludedCostYuan);
  const cappedSurplusRates = evaluations.map((evaluation) =>
    Math.min(
      calculateSafetySurplusRate(evaluation, parameters),
      resolvedOptions.maxSafetySurplusRate,
    ),
  );
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minSurplusRate = Math.min(...cappedSurplusRates);
  const maxSurplusRate = Math.max(...cappedSurplusRates);

  return evaluations.map((evaluation, index) => {
    const costScore = normalizeInvertedScore(
      evaluation.cost.taxIncludedCostYuan,
      minCost,
      maxCost,
    );
    const safetyScore = normalizeScore(cappedSurplusRates[index] ?? 0, minSurplusRate, maxSurplusRate);
    const historicalHabitScore = historicalHabitContext
      ? getHistoricalHabitScore(evaluation, historicalHabitContext)
      : undefined;

    return {
      evaluation,
      costScore,
      safetyScore,
      historicalHabitScore,
      balancedScore:
        costScore * resolvedOptions.balancedCostWeight +
        safetyScore * resolvedOptions.balancedSafetyWeight +
        (historicalHabitScore ?? 0) * (resolvedOptions.historicalHabitWeight ?? 0),
    };
  });
}

export function sortCandidatesByBalanced(
  evaluations: EligibleCandidateEvaluation[],
  parameters: CalculationParameters,
  options: Partial<RecommendationOptions> = {},
  historicalHabitContext?: HistoricalHabitSelectionContext | undefined,
): EligibleCandidateEvaluation[] {
  return scoreBalancedCandidates(evaluations, parameters, options, historicalHabitContext)
    .sort((first, second) => {
      const scoreDifference = second.balancedScore - first.balancedScore;

      if (Math.abs(scoreDifference) >= COST_EPSILON) {
        return scoreDifference;
      }

      const costDifference =
        first.evaluation.cost.taxIncludedCostYuan - second.evaluation.cost.taxIncludedCostYuan;

      if (Math.abs(costDifference) >= COST_EPSILON) {
        return costDifference;
      }

      return compareByFingerprint(first.evaluation, second.evaluation);
    })
    .map((score) => score.evaluation);
}

function resolveRecommendationOptions(
  options: Partial<RecommendationOptions>,
): RecommendationOptions {
  return {
    ...DEFAULT_RECOMMENDATION_OPTIONS,
    ...options,
  };
}

function sortHistoricalMatchesFirst(
  evaluations: EligibleCandidateEvaluation[],
  historicalHabitContext: HistoricalHabitSelectionContext | undefined,
  sort: (items: EligibleCandidateEvaluation[]) => EligibleCandidateEvaluation[],
): EligibleCandidateEvaluation[] {
  if (!historicalHabitContext || historicalHabitContext.status !== "available") {
    return sort(evaluations);
  }

  const historicalMatches = evaluations.filter((evaluation) =>
    hasHistoricalHabitMatch(evaluation, historicalHabitContext),
  );
  const otherCandidates = evaluations.filter(
    (evaluation) => !hasHistoricalHabitMatch(evaluation, historicalHabitContext),
  );

  if (historicalMatches.length === 0) {
    return sort(evaluations);
  }

  return [...sort(historicalMatches), ...sort(otherCandidates)];
}

function hasHistoricalHabitMatch(
  evaluation: EligibleCandidateEvaluation,
  historicalHabitContext: HistoricalHabitSelectionContext,
): boolean {
  const info =
    historicalHabitContext.historicalHabitByCandidateFingerprint[
      createMatchingCandidateFingerprint(evaluation.candidate)
    ];

  return info !== undefined && info.level !== "insufficient";
}

function getHistoricalHabitScore(
  evaluation: EligibleCandidateEvaluation,
  historicalHabitContext: HistoricalHabitSelectionContext,
): number {
  const info =
    historicalHabitContext.historicalHabitByCandidateFingerprint[
      createMatchingCandidateFingerprint(evaluation.candidate)
    ];

  return getHistoricalHabitLevelScore(info);
}

function getHistoricalHabitLevelScore(
  info: RecommendationHistoricalHabitInfo | undefined,
): number {
  if (!info) {
    return 0;
  }

  if (info.level === "high") {
    return 1;
  }

  if (info.level === "medium") {
    return 0.65;
  }

  if (info.level === "low") {
    return 0.2;
  }

  return 0;
}

function normalizeInvertedScore(value: number, min: number, max: number): number {
  if (Math.abs(max - min) < COST_EPSILON) {
    return 1;
  }

  return (max - value) / (max - min);
}

function normalizeScore(value: number, min: number, max: number): number {
  if (Math.abs(max - min) < COST_EPSILON) {
    return 1;
  }

  return (value - min) / (max - min);
}

function compareByFingerprint(
  first: EligibleCandidateEvaluation,
  second: EligibleCandidateEvaluation,
): number {
  return createCandidateFingerprint(first).localeCompare(createCandidateFingerprint(second));
}
