import type {
  FluteType,
  MatchingCandidate,
  SingleFluteType,
} from "@/modules/calculations/types";
import type { RecommendablePaperMaterial } from "@/modules/master-data/list-recommendable-paper-materials";
import { isOuterInnerLinerWeightCompliant } from "@/modules/recommendation/company-paper-principles";

const DEFAULT_LINER_PRESELECTION_LIMIT = 24;
const DEFAULT_CORRUGATING_PRESELECTION_LIMIT = 12;
const DEFAULT_FIVE_LAYER_LINER_PRESELECTION_LIMIT = 8;
const DEFAULT_FIVE_LAYER_CORRUGATING_PRESELECTION_LIMIT = 6;
const DEFAULT_MEDIUM_PRESELECTION_LIMIT = 4;
const DEFAULT_SEVEN_LAYER_LINER_PRESELECTION_LIMIT = 6;
const DEFAULT_SEVEN_LAYER_CORRUGATING_PRESELECTION_LIMIT = 4;
const DEFAULT_SEVEN_LAYER_MEDIUM_PRESELECTION_LIMIT = 4;
const COMMON_FIVE_LAYER_LINER_WEIGHTS_GSM = [190, 200, 250, 160];

export function createDefaultMatchingCandidates(
  materials: RecommendablePaperMaterial[],
): MatchingCandidate[] {
  const linerMaterials = materials.filter((material) => material.paperKind === "linerboard");
  const corrugatingMaterials = materials.filter((material) => material.paperKind === "corrugating");
  const liners = selectRepresentativePaperMaterials(
    linerMaterials,
    DEFAULT_LINER_PRESELECTION_LIMIT,
  );
  const corrugatings = selectRepresentativePaperMaterials(
    corrugatingMaterials,
    DEFAULT_CORRUGATING_PRESELECTION_LIMIT,
  );
  const fiveLayerLiners = selectCommonFiveLayerLinerPaperMaterials(
    linerMaterials,
    DEFAULT_FIVE_LAYER_LINER_PRESELECTION_LIMIT,
  );
  const fiveLayerMediums = selectLowGramWeightPaperMaterials(
    linerMaterials,
    DEFAULT_MEDIUM_PRESELECTION_LIMIT,
  );
  const fiveLayerCorrugatings = selectRepresentativePaperMaterials(
    corrugatingMaterials,
    DEFAULT_FIVE_LAYER_CORRUGATING_PRESELECTION_LIMIT,
  );
  const sevenLayerLiners = selectRepresentativePaperMaterials(
    linerMaterials,
    DEFAULT_SEVEN_LAYER_LINER_PRESELECTION_LIMIT,
  );
  const sevenLayerMediums = selectLowGramWeightPaperMaterials(
    linerMaterials,
    DEFAULT_SEVEN_LAYER_MEDIUM_PRESELECTION_LIMIT,
  );
  const sevenLayerCorrugatings = selectRepresentativePaperMaterials(
    corrugatingMaterials,
    DEFAULT_SEVEN_LAYER_CORRUGATING_PRESELECTION_LIMIT,
  );
  const sevenLayerBCorrugatings = selectMaterialsBySingleFlute(sevenLayerCorrugatings, "B");
  const sevenLayerACorrugatings = selectMaterialsBySingleFlute(sevenLayerCorrugatings, "A");
  const sevenLayerCCorrugatings = selectMaterialsBySingleFlute(sevenLayerCorrugatings, "C");
  const candidates: MatchingCandidate[] = [];

  for (const outer of liners) {
    for (const inner of liners) {
      if (
        !isOuterInnerLinerWeightCompliant({
          outerWeightGsm: outer.gramWeightGsm,
          innerWeightGsm: inner.gramWeightGsm,
        })
      ) {
        continue;
      }

      for (const corrugating of corrugatings) {
        for (const flute of getSingleFlutes(corrugating)) {
          candidates.push({
            id: `${outer.id}-${corrugating.id}-${inner.id}-${flute}`,
            layerCount: 3,
            fluteType: flute,
            layers: [
              {
                role: "outer_liner",
                paper: toCandidatePaperMaterial(outer),
              },
              {
                role: "corrugating",
                flute,
                paper: toCandidatePaperMaterial(corrugating),
              },
              {
                role: "inner_liner",
                paper: toCandidatePaperMaterial(inner),
              },
            ],
          });
        }
      }
    }
  }

  for (const outer of fiveLayerLiners) {
    for (const inner of fiveLayerLiners) {
      if (
        !isOuterInnerLinerWeightCompliant({
          outerWeightGsm: outer.gramWeightGsm,
          innerWeightGsm: inner.gramWeightGsm,
        })
      ) {
        continue;
      }

      for (const medium of fiveLayerMediums) {
        for (const firstCorrugating of fiveLayerCorrugatings) {
          for (const secondCorrugating of fiveLayerCorrugatings) {
            for (const flutePair of getDoubleFlutePairs(firstCorrugating, secondCorrugating)) {
              candidates.push({
                id: [
                  outer.id,
                  firstCorrugating.id,
                  medium.id,
                  secondCorrugating.id,
                  inner.id,
                  flutePair.fluteType,
                ].join("-"),
                layerCount: 5,
                fluteType: flutePair.fluteType,
                layers: [
                  {
                    role: "outer_liner",
                    paper: toCandidatePaperMaterial(outer),
                  },
                  {
                    role: "corrugating",
                    flute: flutePair.firstFlute,
                    paper: toCandidatePaperMaterial(firstCorrugating),
                  },
                  {
                    role: "medium",
                    paper: toCandidatePaperMaterial(medium),
                  },
                  {
                    role: "corrugating",
                    flute: flutePair.secondFlute,
                    paper: toCandidatePaperMaterial(secondCorrugating),
                  },
                  {
                    role: "inner_liner",
                    paper: toCandidatePaperMaterial(inner),
                  },
                ],
              });
            }
          }
        }
      }
    }
  }

  for (const outer of sevenLayerLiners) {
    for (const inner of sevenLayerLiners) {
      if (
        !isOuterInnerLinerWeightCompliant({
          outerWeightGsm: outer.gramWeightGsm,
          innerWeightGsm: inner.gramWeightGsm,
        })
      ) {
        continue;
      }

      for (const firstMedium of sevenLayerMediums) {
        for (const secondMedium of sevenLayerMediums) {
          for (const bCorrugating of sevenLayerBCorrugatings) {
            for (const aCorrugating of sevenLayerACorrugatings) {
              for (const cCorrugating of sevenLayerCCorrugatings) {
                candidates.push({
                  id: [
                    outer.id,
                    bCorrugating.id,
                    firstMedium.id,
                    aCorrugating.id,
                    secondMedium.id,
                    cCorrugating.id,
                    inner.id,
                    "BAC",
                  ].join("-"),
                  layerCount: 7,
                  fluteType: "BAC",
                  layers: [
                    {
                      role: "outer_liner",
                      paper: toCandidatePaperMaterial(outer),
                    },
                    {
                      role: "corrugating",
                      flute: "B",
                      paper: toCandidatePaperMaterial(bCorrugating),
                    },
                    {
                      role: "medium",
                      paper: toCandidatePaperMaterial(firstMedium),
                    },
                    {
                      role: "corrugating",
                      flute: "A",
                      paper: toCandidatePaperMaterial(aCorrugating),
                    },
                    {
                      role: "medium",
                      paper: toCandidatePaperMaterial(secondMedium),
                    },
                    {
                      role: "corrugating",
                      flute: "C",
                      paper: toCandidatePaperMaterial(cCorrugating),
                    },
                    {
                      role: "inner_liner",
                      paper: toCandidatePaperMaterial(inner),
                    },
                  ],
                });
              }
            }
          }
        }
      }
    }
  }

  return candidates;
}

function selectRepresentativePaperMaterials(
  materials: RecommendablePaperMaterial[],
  limit: number,
): RecommendablePaperMaterial[] {
  if (materials.length <= limit) {
    return materials;
  }

  const selected = new Map<string, RecommendablePaperMaterial>();
  const strategyTakeCount = Math.max(3, Math.floor(limit / 6));
  const addRanked = (rankedMaterials: RecommendablePaperMaterial[], takeCount: number) => {
    for (const material of rankedMaterials.slice(0, takeCount)) {
      if (selected.size >= limit) {
        return;
      }

      selected.set(material.id, material);
    }
  };

  addRanked([...materials].sort(compareByPriceAsc), strategyTakeCount);
  addRanked([...materials].sort(compareByRingCrushDesc), strategyTakeCount);
  addRanked([...materials].sort(compareByBurstDesc), strategyTakeCount);
  addRanked([...materials].sort(compareByGramWeightAsc), strategyTakeCount);
  addRanked(selectBestByGramWeightAndGrade(materials, compareByPriceAsc), limit);
  addRanked(selectBestByGramWeightAndGrade(materials, compareByRingCrushDesc), limit);
  addRanked([...materials].sort(compareByPriceAsc), limit);

  return Array.from(selected.values()).slice(0, limit);
}

function selectCommonFiveLayerLinerPaperMaterials(
  materials: RecommendablePaperMaterial[],
  limit: number,
): RecommendablePaperMaterial[] {
  if (materials.length <= limit) {
    return materials;
  }

  const selected = new Map<string, RecommendablePaperMaterial>();
  const addMaterial = (material: RecommendablePaperMaterial | undefined) => {
    if (material && selected.size < limit) {
      selected.set(material.id, material);
    }
  };

  for (const gramWeight of COMMON_FIVE_LAYER_LINER_WEIGHTS_GSM) {
    addMaterial(selectBestMaterialByExactGramWeight(materials, gramWeight));
  }

  for (const material of selectRepresentativePaperMaterials(materials, limit)) {
    addMaterial(material);
  }

  return Array.from(selected.values()).slice(0, limit);
}

function selectBestMaterialByExactGramWeight(
  materials: RecommendablePaperMaterial[],
  gramWeightGsm: number,
): RecommendablePaperMaterial | undefined {
  return materials
    .filter((material) => material.gramWeightGsm === gramWeightGsm)
    .sort(compareByPriceAsc)[0];
}

function selectBestByGramWeightAndGrade(
  materials: RecommendablePaperMaterial[],
  compare: (left: RecommendablePaperMaterial, right: RecommendablePaperMaterial) => number,
): RecommendablePaperMaterial[] {
  const selectedByGroup = new Map<string, RecommendablePaperMaterial>();

  for (const material of materials) {
    const groupKey = `${material.grade ?? ""}:${Math.floor(material.gramWeightGsm / 20) * 20}`;
    const current = selectedByGroup.get(groupKey);

    if (!current || compare(material, current) < 0) {
      selectedByGroup.set(groupKey, material);
    }
  }

  return Array.from(selectedByGroup.values()).sort(compare);
}

function getSingleFlutes(material: RecommendablePaperMaterial): SingleFluteType[] {
  const flutes = material.applicableFlutes.filter(isSingleFlute);

  return flutes.length > 0 ? flutes : ["B"];
}

function getDoubleFlutePairs(
  firstMaterial: RecommendablePaperMaterial,
  secondMaterial: RecommendablePaperMaterial,
): Array<{
  fluteType: FluteType;
  firstFlute: SingleFluteType;
  secondFlute: SingleFluteType;
}> {
  const pairs: Array<{
    fluteType: FluteType;
    firstFlute: SingleFluteType;
    secondFlute: SingleFluteType;
  }> = [];

  for (const firstFlute of getSingleFlutes(firstMaterial)) {
    for (const secondFlute of getSingleFlutes(secondMaterial)) {
      const fluteType = toDoubleFluteType(firstFlute, secondFlute);

      if (fluteType) {
        pairs.push({
          fluteType,
          firstFlute,
          secondFlute,
        });
      }
    }
  }

  return pairs;
}

function selectMaterialsBySingleFlute(
  materials: RecommendablePaperMaterial[],
  flute: SingleFluteType,
): RecommendablePaperMaterial[] {
  return materials.filter((material) => getSingleFlutes(material).includes(flute));
}

function toDoubleFluteType(
  firstFlute: SingleFluteType,
  secondFlute: SingleFluteType,
): FluteType | undefined {
  if (firstFlute === "A" && secondFlute === "B") {
    return "AB";
  }

  if (firstFlute === "B" && secondFlute === "A") {
    return "BA";
  }

  if (firstFlute === "A" && secondFlute === "C") {
    return "AC";
  }

  if (firstFlute === "B" && secondFlute === "C") {
    return "BC";
  }

  if (firstFlute === "B" && secondFlute === "E") {
    return "BE";
  }

  return undefined;
}

function isSingleFlute(value: string): value is SingleFluteType {
  return value === "A" || value === "B" || value === "C" || value === "E";
}

function selectLowGramWeightPaperMaterials(
  materials: RecommendablePaperMaterial[],
  limit: number,
): RecommendablePaperMaterial[] {
  return [...materials].sort(compareByGramWeightAsc).slice(0, limit);
}

function toCandidatePaperMaterial(material: RecommendablePaperMaterial) {
  return {
    id: material.id,
    paperCode: material.paperCode,
    factoryName: material.factoryName,
    name: material.name,
    gramWeightGsm: material.gramWeightGsm,
    priceYuanPerTon: material.priceYuanPerTon,
    burstIndex: material.burstIndex,
    ringCrushIndex: material.ringCrushIndex,
  };
}

function compareByPriceAsc(
  left: RecommendablePaperMaterial,
  right: RecommendablePaperMaterial,
): number {
  return (
    compareNumberAsc(left.priceYuanPerTon, right.priceYuanPerTon) || compareMaterialId(left, right)
  );
}

function compareByRingCrushDesc(
  left: RecommendablePaperMaterial,
  right: RecommendablePaperMaterial,
): number {
  return (
    compareNumberDesc(left.ringCrushIndex, right.ringCrushIndex) || compareMaterialId(left, right)
  );
}

function compareByBurstDesc(
  left: RecommendablePaperMaterial,
  right: RecommendablePaperMaterial,
): number {
  return compareNumberDesc(left.burstIndex, right.burstIndex) || compareMaterialId(left, right);
}

function compareByGramWeightAsc(
  left: RecommendablePaperMaterial,
  right: RecommendablePaperMaterial,
): number {
  return (
    compareNumberAsc(left.gramWeightGsm, right.gramWeightGsm) || compareMaterialId(left, right)
  );
}

function compareNumberAsc(left: number | undefined, right: number | undefined): number {
  return (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY);
}

function compareNumberDesc(left: number | undefined, right: number | undefined): number {
  return (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
}

function compareMaterialId(
  left: RecommendablePaperMaterial,
  right: RecommendablePaperMaterial,
): number {
  return `${left.paperCode}:${left.id}`.localeCompare(`${right.paperCode}:${right.id}`);
}

