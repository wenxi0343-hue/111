import type {
  CandidateLayer,
  FluteType,
  LayerCount,
  MatchingCandidate,
  SingleFluteType,
} from "@/modules/calculations/types";
import type { HistoricalHabitRecommendationContext } from "@/modules/historical-orders/recommendation-context";
import type { HistoricalOrderHabitSummaryItem } from "@/modules/historical-orders/list-habit-summaries";
import type { RecommendablePaperMaterial } from "@/modules/master-data/list-recommendable-paper-materials";

import { createMatchingCandidateFingerprint } from "./scoring";

const CURRENT_UNAVAILABLE_MESSAGE = "历史常用组合当前不可用";
const GRAM_WEIGHT_APPROXIMATE_MESSAGE =
  "历史常用克重当前不完全一致，已使用当前可用相近原纸";

export type HistoricalHabitCandidateUnavailableReasonCode =
  | "FACTORY_UNAVAILABLE"
  | "CORRUGATING_UNAVAILABLE"
  | "MATERIAL_UNAVAILABLE"
  | "UNSUPPORTED_COMBINATION";

export interface HistoricalHabitCandidateEvidence {
  summary: HistoricalOrderHabitSummaryItem;
  notices: string[];
}

export interface HistoricalHabitCandidateUnavailableRecord {
  summary: HistoricalOrderHabitSummaryItem;
  reasonCode: HistoricalHabitCandidateUnavailableReasonCode;
  message: string;
}

export interface HistoricalHabitCandidateGenerationResult {
  candidates: MatchingCandidate[];
  historicalCandidates: MatchingCandidate[];
  unavailableRecords: HistoricalHabitCandidateUnavailableRecord[];
  evidenceByCandidateFingerprint: Record<string, HistoricalHabitCandidateEvidence[]>;
  messages: string[];
  notices: string[];
}

interface SelectedPaper {
  material: RecommendablePaperMaterial;
  isApproximateGramWeight: boolean;
}

export function createHistoricalHabitMatchingCandidates(input: {
  historicalHabitContext: HistoricalHabitRecommendationContext;
  materials: RecommendablePaperMaterial[];
  defaultCandidates?: MatchingCandidate[] | undefined;
}): HistoricalHabitCandidateGenerationResult {
  const defaultCandidates = input.defaultCandidates ?? [];

  if (input.historicalHabitContext.status !== "available") {
    return {
      candidates: defaultCandidates,
      historicalCandidates: [],
      unavailableRecords: [],
      evidenceByCandidateFingerprint: {},
      messages: input.historicalHabitContext.messages,
      notices: [],
    };
  }

  const unavailableRecords: HistoricalHabitCandidateUnavailableRecord[] = [];
  const evidenceByCandidateFingerprint: Record<string, HistoricalHabitCandidateEvidence[]> = {};
  const notices = new Set<string>();
  const historicalCandidates: MatchingCandidate[] = [];
  const sortedSummaries = sortSummaries(input.historicalHabitContext.summaries);

  for (const summary of sortedSummaries) {
    const result = createCandidateFromSummary({
      summary,
      materials: input.materials,
    });

    if (!result.ok) {
      unavailableRecords.push(result.record);
      continue;
    }

    for (const notice of result.evidence.notices) {
      notices.add(notice);
    }

    const fingerprint = createMatchingCandidateFingerprint(result.candidate);

    if (!evidenceByCandidateFingerprint[fingerprint]) {
      historicalCandidates.push(result.candidate);
      evidenceByCandidateFingerprint[fingerprint] = [];
    }

    evidenceByCandidateFingerprint[fingerprint]?.push(result.evidence);
  }

  const seenFingerprints = new Set<string>();
  const candidates: MatchingCandidate[] = [];

  for (const candidate of [...historicalCandidates, ...defaultCandidates]) {
    const fingerprint = createMatchingCandidateFingerprint(candidate);

    if (seenFingerprints.has(fingerprint)) {
      continue;
    }

    seenFingerprints.add(fingerprint);
    candidates.push(candidate);
  }

  return {
    candidates,
    historicalCandidates,
    unavailableRecords,
    evidenceByCandidateFingerprint,
    messages: [],
    notices: Array.from(notices),
  };
}

export function splitHistoricalFluteType(flute: string): SingleFluteType[] {
  if (isSingleFlute(flute)) {
    return [flute];
  }

  if (flute === "AB" || flute === "BA") {
    return ["A", "B"];
  }

  if (flute === "AC") {
    return ["A", "C"];
  }

  if (flute === "BC") {
    return ["B", "C"];
  }

  if (flute === "BE") {
    return ["B", "E"];
  }

  if (flute === "BAC") {
    return ["B", "A", "C"];
  }

  return [];
}

function createCandidateFromSummary(input: {
  summary: HistoricalOrderHabitSummaryItem;
  materials: RecommendablePaperMaterial[];
}):
  | {
      ok: true;
      candidate: MatchingCandidate;
      evidence: HistoricalHabitCandidateEvidence;
    }
  | { ok: false; record: HistoricalHabitCandidateUnavailableRecord } {
  const { summary } = input;
  const layerCount = normalizeLayerCount(summary.layerCount);
  const fluteType = normalizeFluteType(summary.flute);

  if (!layerCount || !fluteType) {
    return unavailable(summary, "UNSUPPORTED_COMBINATION", CURRENT_UNAVAILABLE_MESSAGE);
  }

  const flutes = splitHistoricalFluteType(fluteType);

  if (flutes.length !== getCorrugatingLayerCount(layerCount)) {
    return unavailable(summary, "UNSUPPORTED_COMBINATION", CURRENT_UNAVAILABLE_MESSAGE);
  }

  const availableMaterials = input.materials.filter(
    (material) => material.isActive && material.completenessStatus === "complete",
  );
  const factoryMaterials = filterByHistoricalFactories(availableMaterials, summary.factoryNames);

  if (summary.factoryNames.length > 0 && factoryMaterials.length === 0) {
    return unavailable(summary, "FACTORY_UNAVAILABLE", CURRENT_UNAVAILABLE_MESSAGE);
  }

  const materialPool = summary.factoryNames.length > 0 ? factoryMaterials : availableMaterials;
  const liners = materialPool.filter((material) => material.paperKind === "linerboard");
  const corrugatings = materialPool.filter((material) => material.paperKind === "corrugating");
  const selectedCorrugatings: SelectedPaper[] = [];

  for (const flute of flutes) {
    const selectedCorrugating = selectPaper({
      candidates: corrugatings.filter((material) => materialSupportsFlute(material, flute)),
      targetGramWeights: summary.gramWeights,
    });

    if (!selectedCorrugating) {
      return unavailable(summary, "CORRUGATING_UNAVAILABLE", "当前瓦纸不可用");
    }

    selectedCorrugatings.push(selectedCorrugating);
  }

  const selectedLiner = selectPaper({
    candidates: liners,
    targetGramWeights: summary.gramWeights,
  });

  if (!selectedLiner) {
    return unavailable(summary, "MATERIAL_UNAVAILABLE", CURRENT_UNAVAILABLE_MESSAGE);
  }

  const notices = [
    selectedLiner,
    ...selectedCorrugatings,
  ].some((selectedPaper) => selectedPaper.isApproximateGramWeight)
    ? [GRAM_WEIGHT_APPROXIMATE_MESSAGE]
    : [];
  const candidate = buildCandidate({
    summary,
    layerCount,
    fluteType,
    liner: selectedLiner.material,
    corrugatings: selectedCorrugatings.map((selectedPaper) => selectedPaper.material),
    flutes,
  });

  return {
    ok: true,
    candidate,
    evidence: {
      summary,
      notices,
    },
  };
}

function buildCandidate(input: {
  summary: HistoricalOrderHabitSummaryItem;
  layerCount: LayerCount;
  fluteType: FluteType;
  liner: RecommendablePaperMaterial;
  corrugatings: RecommendablePaperMaterial[];
  flutes: SingleFluteType[];
}): MatchingCandidate {
  const linerLayer = toCandidateLayer("outer_liner", input.liner);
  const innerLayer = toCandidateLayer("inner_liner", input.liner);
  const mediumLayer = () => toCandidateLayer("medium", input.liner);
  const corrugatingLayer = (index: number) =>
    toCandidateLayer("corrugating", input.corrugatings[index]!, input.flutes[index]);
  const layers: CandidateLayer[] =
    input.layerCount === 3
      ? [linerLayer, corrugatingLayer(0), innerLayer]
      : input.layerCount === 5
        ? [linerLayer, corrugatingLayer(0), mediumLayer(), corrugatingLayer(1), innerLayer]
        : [
            linerLayer,
            corrugatingLayer(0),
            mediumLayer(),
            corrugatingLayer(1),
            mediumLayer(),
            corrugatingLayer(2),
            innerLayer,
          ];

  return {
    id: [
      "historical",
      input.summary.dimensionType,
      input.summary.dimensionKey,
      input.layerCount,
      input.fluteType,
      ...layers.map((layer) => layer.paper.id),
    ].join("-"),
    layerCount: input.layerCount,
    fluteType: input.fluteType,
    layers,
  };
}

function toCandidateLayer(
  role: CandidateLayer["role"],
  material: RecommendablePaperMaterial,
  flute?: SingleFluteType | undefined,
): CandidateLayer {
  return {
    role,
    flute,
    paper: {
      id: material.id,
      paperCode: material.paperCode,
      factoryName: material.factoryName,
      name: material.name,
      gramWeightGsm: material.gramWeightGsm,
      priceYuanPerTon: material.priceYuanPerTon,
      burstIndex: material.burstIndex,
      ringCrushIndex: material.ringCrushIndex,
    },
  };
}

function selectPaper(input: {
  candidates: RecommendablePaperMaterial[];
  targetGramWeights: number[];
}): SelectedPaper | undefined {
  if (input.candidates.length === 0) {
    return undefined;
  }

  const sortedCandidates = [...input.candidates].sort((left, right) =>
    left.paperCode.localeCompare(right.paperCode),
  );
  const exactCandidate = sortedCandidates.find((candidate) =>
    input.targetGramWeights.includes(candidate.gramWeightGsm),
  );

  if (exactCandidate) {
    return {
      material: exactCandidate,
      isApproximateGramWeight: false,
    };
  }

  const nearestCandidate = [...sortedCandidates].sort(
    (left, right) =>
      getNearestGramDistance(left.gramWeightGsm, input.targetGramWeights) -
        getNearestGramDistance(right.gramWeightGsm, input.targetGramWeights) ||
      left.paperCode.localeCompare(right.paperCode),
  )[0];

  if (!nearestCandidate) {
    return undefined;
  }

  return {
    material: nearestCandidate,
    isApproximateGramWeight: input.targetGramWeights.length > 0,
  };
}

function getNearestGramDistance(gramWeight: number, targetGramWeights: number[]): number {
  if (targetGramWeights.length === 0) {
    return 0;
  }

  return Math.min(...targetGramWeights.map((targetGramWeight) => Math.abs(gramWeight - targetGramWeight)));
}

function sortSummaries(
  summaries: HistoricalOrderHabitSummaryItem[],
): HistoricalOrderHabitSummaryItem[] {
  return [...summaries].sort((left, right) => {
    const orderCountDifference = right.orderCount - left.orderCount;

    if (orderCountDifference !== 0) {
      return orderCountDifference;
    }

    const frequencyDifference = right.frequency - left.frequency;

    if (Math.abs(frequencyDifference) > 0.0001) {
      return frequencyDifference;
    }

    return `${left.dimensionType}:${left.dimensionKey}`.localeCompare(
      `${right.dimensionType}:${right.dimensionKey}`,
    );
  });
}

function filterByHistoricalFactories(
  materials: RecommendablePaperMaterial[],
  factoryNames: string[],
): RecommendablePaperMaterial[] {
  if (factoryNames.length === 0) {
    return materials;
  }

  return materials.filter((material) => factoryNames.includes(material.factoryName));
}

function materialSupportsFlute(
  material: RecommendablePaperMaterial,
  flute: SingleFluteType,
): boolean {
  if (material.applicableFlutes.length === 0) {
    return flute === "B";
  }

  return material.applicableFlutes.includes(flute);
}

function getCorrugatingLayerCount(layerCount: LayerCount): number {
  if (layerCount === 3) {
    return 1;
  }

  if (layerCount === 5) {
    return 2;
  }

  return 3;
}

function normalizeLayerCount(value: number | undefined): LayerCount | undefined {
  return value === 3 || value === 5 || value === 7 ? value : undefined;
}

function normalizeFluteType(value: string | undefined): FluteType | undefined {
  if (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "E" ||
    value === "AB" ||
    value === "AC" ||
    value === "BC" ||
    value === "BA" ||
    value === "BE" ||
    value === "BAC"
  ) {
    return value;
  }

  return undefined;
}

function isSingleFlute(value: string): value is SingleFluteType {
  return value === "A" || value === "B" || value === "C" || value === "E";
}

function unavailable(
  summary: HistoricalOrderHabitSummaryItem,
  reasonCode: HistoricalHabitCandidateUnavailableReasonCode,
  message: string,
): { ok: false; record: HistoricalHabitCandidateUnavailableRecord } {
  return {
    ok: false,
    record: {
      summary,
      reasonCode,
      message,
    },
  };
}
