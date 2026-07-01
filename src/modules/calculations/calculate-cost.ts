import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import type {
  BoardAreaResult,
  CalculationParameters,
  CandidateLayer,
  CostResult,
  MatchingCandidate,
  SingleFluteType,
} from "./types";

export function calculateCost(input: {
  boxSpec: NormalizedBoxSpec;
  candidate: MatchingCandidate;
  area: BoardAreaResult;
  parameters: CalculationParameters;
}): CostResult {
  const { boxSpec, candidate, area, parameters } = input;
  const utilizationRate = calculateUtilizationRate(boxSpec.productionQuantity, parameters);
  const layerUnitPrices = candidate.layers.map((layer) => ({
    role: layer.role,
    paperCode: layer.paper.paperCode,
    unitPriceYuanPerSquareMeter: calculateLayerUnitPrice(layer, candidate, parameters),
  }));
  const layerUnitPriceTotal = layerUnitPrices.reduce(
    (total, layerPrice) => total + layerPrice.unitPriceYuanPerSquareMeter,
    0,
  );
  const paperCostYuan = (layerUnitPriceTotal * area.areaSquareMeters) / utilizationRate;
  const processingFeeYuan =
    (parameters.processingFeeFactorsByLayerCount[candidate.layerCount] *
      0.9 *
      area.areaSquareMeters) /
    utilizationRate;
  const padFeeYuan = parameters.padFeeYuan;
  const taxYuan = (padFeeYuan + processingFeeYuan + paperCostYuan) * 1.05 * 0.015;

  return {
    utilizationRate,
    padFeeYuan,
    layerUnitPrices,
    paperCostYuan,
    processingFeeYuan,
    taxYuan,
    taxIncludedCostYuan: padFeeYuan + processingFeeYuan + taxYuan + paperCostYuan,
  };
}

function calculateUtilizationRate(
  productionQuantity: number,
  parameters: CalculationParameters,
): number {
  const matchingRule = [...parameters.utilizationRateRules]
    .sort((left, right) => right.minQuantity - left.minQuantity)
    .find((rule) => productionQuantity >= rule.minQuantity);

  return Math.min(matchingRule?.rate ?? 0.8, parameters.maxUtilizationRate);
}

function calculateLayerUnitPrice(
  layer: CandidateLayer,
  candidate: MatchingCandidate,
  parameters: CalculationParameters,
): number {
  const baseUnitPrice =
    (readNumber(layer.paper.priceYuanPerTon) * readNumber(layer.paper.gramWeightGsm)) /
    1_000_000;

  if (layer.role !== "corrugating") {
    return baseUnitPrice;
  }

  return baseUnitPrice * parameters.corrugationTakeUpFactors[resolveCorrugatingFlute(layer, candidate)];
}

function resolveCorrugatingFlute(
  layer: CandidateLayer,
  candidate: MatchingCandidate,
): SingleFluteType {
  if (layer.flute) {
    return layer.flute;
  }

  if (
    candidate.fluteType === "A" ||
    candidate.fluteType === "B" ||
    candidate.fluteType === "C" ||
    candidate.fluteType === "E"
  ) {
    return candidate.fluteType;
  }

  throw new Error(`Corrugating layer ${layer.paper.paperCode} is missing flute type`);
}

function readNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Cost calculation requires complete numeric paper data");
  }

  return value;
}
