export interface PaperCodeMatchCandidate {
  id: string;
  paperCode: string;
}

export interface MatchPaperCodeInput<TCandidate extends PaperCodeMatchCandidate> {
  paperCode: string | undefined;
  candidates: TCandidate[];
}

export interface MatchPaperCodesInput<TCandidate extends PaperCodeMatchCandidate> {
  paperCodes: Array<string | undefined>;
  candidates: TCandidate[];
}

export interface PaperCodeMatchSummary {
  matchedCount: number;
  confirmationRequiredCount: number;
  failedCount: number;
  suspectedGramWeightCount: number;
  emptyCount: number;
  unmatchedCount: number;
}

export interface PaperCodeBatchMatchResult<TCandidate extends PaperCodeMatchCandidate> {
  rows: Array<PaperCodeMatchResult<TCandidate>>;
  summary: PaperCodeMatchSummary;
}

interface PaperCodeMatchResultBase {
  input: string;
  normalizedInput: string;
}

export type PaperCodeMatchResult<TCandidate extends PaperCodeMatchCandidate> =
  | (PaperCodeMatchResultBase & {
      status: "matched";
      material: TCandidate;
    })
  | (PaperCodeMatchResultBase & {
      status: "case_mismatch";
      candidates: TCandidate[];
      message: string;
    })
  | (PaperCodeMatchResultBase & {
      status: "ambiguous_case";
      candidates: TCandidate[];
      message: string;
    })
  | (PaperCodeMatchResultBase & {
      status: "suspected_gram_weight";
      message: string;
    })
  | (PaperCodeMatchResultBase & {
      status: "empty";
      message: string;
    })
  | (PaperCodeMatchResultBase & {
      status: "unmatched";
      message: string;
    });

export function matchPaperCode<TCandidate extends PaperCodeMatchCandidate>(
  input: MatchPaperCodeInput<TCandidate>,
): PaperCodeMatchResult<TCandidate> {
  const originalInput = input.paperCode ?? "";
  const normalizedInput = originalInput.trim();

  if (!normalizedInput) {
    return {
      status: "empty",
      input: originalInput,
      normalizedInput,
      message: "原纸代码为空",
    };
  }

  const exactMatch = input.candidates.find((candidate) => candidate.paperCode === normalizedInput);

  if (exactMatch) {
    return {
      status: "matched",
      input: originalInput,
      normalizedInput,
      material: exactMatch,
    };
  }

  const caseCandidates = input.candidates.filter(
    (candidate) => candidate.paperCode.toLowerCase() === normalizedInput.toLowerCase(),
  );

  if (caseCandidates.length === 1) {
    return {
      status: "case_mismatch",
      input: originalInput,
      normalizedInput,
      candidates: caseCandidates,
      message: "原纸代码疑似大小写错误，请人工确认候选原纸",
    };
  }

  if (caseCandidates.length > 1) {
    return {
      status: "ambiguous_case",
      input: originalInput,
      normalizedInput,
      candidates: caseCandidates,
      message: "原纸代码存在多个大小写候选，无法唯一确定，请人工确认",
    };
  }

  if (isSuspectedGramWeightCode(normalizedInput)) {
    return {
      status: "suspected_gram_weight",
      input: originalInput,
      normalizedInput,
      message: "该输入疑似克重误填为原纸代码",
    };
  }

  return {
    status: "unmatched",
    input: originalInput,
    normalizedInput,
    message: "无法匹配原纸代码",
  };
}

export function matchPaperCodeExactly<TCandidate extends PaperCodeMatchCandidate>(
  paperCode: string | undefined,
  candidates: TCandidate[],
): TCandidate | undefined {
  const result = matchPaperCode({ paperCode, candidates });

  return result.status === "matched" ? result.material : undefined;
}

export function matchPaperCodes<TCandidate extends PaperCodeMatchCandidate>(
  input: MatchPaperCodesInput<TCandidate>,
): PaperCodeBatchMatchResult<TCandidate> {
  const rows = input.paperCodes.map((paperCode) =>
    matchPaperCode({
      paperCode,
      candidates: input.candidates,
    }),
  );

  return {
    rows,
    summary: summarizePaperCodeMatches(rows),
  };
}

export function summarizePaperCodeMatches<TCandidate extends PaperCodeMatchCandidate>(
  rows: Array<PaperCodeMatchResult<TCandidate>>,
): PaperCodeMatchSummary {
  return rows.reduce<PaperCodeMatchSummary>(
    (summary, row) => ({
      matchedCount: summary.matchedCount + (row.status === "matched" ? 1 : 0),
      confirmationRequiredCount:
        summary.confirmationRequiredCount +
        (row.status === "case_mismatch" || row.status === "ambiguous_case" ? 1 : 0),
      failedCount:
        summary.failedCount +
        (row.status === "suspected_gram_weight" ||
        row.status === "empty" ||
        row.status === "unmatched"
          ? 1
          : 0),
      suspectedGramWeightCount:
        summary.suspectedGramWeightCount + (row.status === "suspected_gram_weight" ? 1 : 0),
      emptyCount: summary.emptyCount + (row.status === "empty" ? 1 : 0),
      unmatchedCount: summary.unmatchedCount + (row.status === "unmatched" ? 1 : 0),
    }),
    {
      matchedCount: 0,
      confirmationRequiredCount: 0,
      failedCount: 0,
      suspectedGramWeightCount: 0,
      emptyCount: 0,
      unmatchedCount: 0,
    },
  );
}

function isSuspectedGramWeightCode(value: string): boolean {
  const match = value.match(/^(?<gramWeight>\d{2,3})\s*[gG]?$/u);
  const gramWeight = match?.groups?.gramWeight;

  if (!gramWeight) {
    return false;
  }

  const parsedGramWeight = Number(gramWeight);

  return parsedGramWeight >= 30 && parsedGramWeight <= 999;
}
