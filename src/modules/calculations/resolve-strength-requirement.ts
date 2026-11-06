import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import type {
  CalculationParameters,
  LayerCount,
  StrengthRequirement,
} from "./types";

export function resolveStrengthRequirement(input: {
  boxSpec: NormalizedBoxSpec;
  layerCount: LayerCount;
  parameters: CalculationParameters;
}): StrengthRequirement {
  const { boxSpec, layerCount, parameters } = input;
  const baseThreshold = parameters.strengthThresholds[layerCount];
  const baseBurstStrength = parameters.burstStrengthThresholdsByLayerCount[layerCount];
  const demandFactor = roundToTwoDecimals(
    clamp(
      getWeightDemandFactor(boxSpec.productWeightKg, layerCount) *
        getSizeDemandFactor(boxSpec) *
        getStackingDemandFactor(boxSpec) *
        getSpecialRequirementDemandFactor(boxSpec),
      0.85,
      2.2,
    ),
  );

  return {
    minBctN: Math.round(baseThreshold.minBctN * demandFactor),
    minEdgeCrushKnPerM: roundToTwoDecimals(baseThreshold.minEdgeCrushKnPerM * demandFactor),
    minBurstStrength: Math.round(baseBurstStrength * demandFactor),
    demandFactor,
  };
}

function getWeightDemandFactor(productWeightKg: number, layerCount: LayerCount): number {
  if (layerCount === 3) {
    if (productWeightKg <= 5) {
      return 0.85;
    }
    if (productWeightKg <= 10) {
      return 1;
    }
    if (productWeightKg <= 15) {
      return 1.15;
    }

    return 1.3;
  }

  if (layerCount === 5) {
    if (productWeightKg <= 22) {
      return 1;
    }
    if (productWeightKg <= 26) {
      return 1.12;
    }

    return 1.25;
  }

  if (productWeightKg <= 35) {
    return 1;
  }
  if (productWeightKg <= 45) {
    return 1.15;
  }

  return 1.35;
}

function getSizeDemandFactor(boxSpec: NormalizedBoxSpec): number {
  const volumeCubicMeters =
    (boxSpec.lengthMm * boxSpec.widthMm * boxSpec.heightMm) / 1_000_000_000;

  if (volumeCubicMeters <= 0.014) {
    return 0.9;
  }
  if (volumeCubicMeters <= 0.04) {
    return 1;
  }
  if (volumeCubicMeters <= 0.08) {
    return 1.12;
  }

  return 1.25;
}

function getStackingDemandFactor(boxSpec: NormalizedBoxSpec): number {
  if (boxSpec.stackingRequirement.status !== "required") {
    return 1;
  }

  return 1 + Math.min(Math.max(boxSpec.stackingRequirement.stackingLayers - 1, 0) * 0.08, 0.4);
}

function getSpecialRequirementDemandFactor(boxSpec: NormalizedBoxSpec): number {
  let factor = 1;

  if (boxSpec.specialRequirements.dieCutting) {
    factor *= 1.08;
  }

  if (boxSpec.specialRequirements.punctureStrengthRequired) {
    factor *= 1.12;
  }

  const text = `${boxSpec.productType} ${boxSpec.specialRequirements.notes ?? ""}`;

  if (/贵重|易碎|抗压|强度|堆码|运输|防压/.test(text)) {
    factor *= 1.15;
  }

  return factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
