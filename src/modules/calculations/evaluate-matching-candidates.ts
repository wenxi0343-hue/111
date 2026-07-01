import { evaluateCandidate } from "./evaluate-candidate";
import { DEFAULT_CALCULATION_PARAMETERS, REJECTION_REASON_TYPES } from "./default-parameters";
import type {
  EvaluateMatchingCandidatesInput,
  EvaluateMatchingCandidatesResult,
  RejectedCandidateSummary,
  RejectionReasonType,
} from "./types";

const REJECTION_REASON_LABELS: Record<RejectionReasonType, string> = {
  DATA_MISSING: "数据不足",
  PARAMETER_ERROR: "参数异常",
  NOT_MANUFACTURABLE: "设备不可生产",
  STRENGTH_UNQUALIFIED: "强度不达标",
};

export function evaluateMatchingCandidates(
  input: EvaluateMatchingCandidatesInput,
): EvaluateMatchingCandidatesResult {
  const {
    boxSpec,
    candidates,
    parameters = DEFAULT_CALCULATION_PARAMETERS,
    evaluateCandidateFn = evaluateCandidate,
  } = input;
  const evaluations = candidates.map((candidate) =>
    evaluateCandidateFn({
      boxSpec,
      candidate,
      parameters,
    }),
  );
  const eligibleCandidates = evaluations.filter((evaluation) => evaluation.status === "eligible");
  const rejectedCandidates = evaluations.filter((evaluation) => evaluation.status === "rejected");

  return {
    eligibleCandidates,
    rejectedCandidates,
    rejectedSummary: summarizeRejectedCandidates(rejectedCandidates),
  };
}

export function summarizeRejectedCandidates(
  rejectedCandidates: EvaluateMatchingCandidatesResult["rejectedCandidates"],
): RejectedCandidateSummary[] {
  const counts = new Map<RejectionReasonType, number>();

  for (const rejectedCandidate of rejectedCandidates) {
    for (const reason of rejectedCandidate.reasons) {
      counts.set(reason.type, (counts.get(reason.type) ?? 0) + 1);
    }
  }

  return REJECTION_REASON_TYPES.flatMap((type) => {
    const count = counts.get(type) ?? 0;

    if (count === 0) {
      return [];
    }

    return [
      {
        type,
        label: REJECTION_REASON_LABELS[type],
        count,
      },
    ];
  });
}
