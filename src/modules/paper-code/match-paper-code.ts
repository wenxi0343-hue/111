export interface PaperCodeMatchCandidate {
  id: string;
  paperCode: string;
}

export function matchPaperCodeExactly<TCandidate extends PaperCodeMatchCandidate>(
  paperCode: string | undefined,
  candidates: TCandidate[],
): TCandidate | undefined {
  if (!paperCode) {
    return undefined;
  }

  return candidates.find((candidate) => candidate.paperCode === paperCode);
}
