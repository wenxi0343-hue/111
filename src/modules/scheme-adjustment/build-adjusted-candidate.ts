import type {
  CandidateLayer,
  CandidateLayerRole,
  CandidatePaperMaterial,
  MatchingCandidate,
} from "@/modules/calculations/types";
import type { RecommendablePaperMaterial } from "@/modules/master-data/list-recommendable-paper-materials";
import type { ActionResult } from "@/shared/types/action-result";

import type { SchemeAdjustmentInput, SchemeAdjustmentLayerInput } from "./types";

const INVALID_ADJUSTMENT_MESSAGE = "请检查调整后的纸张配置";
const PAPER_NOT_FOUND_MESSAGE = "调整后的原纸不存在或已停用";

const VALID_LAYER_ROLES: CandidateLayerRole[] = [
  "outer_liner",
  "inner_liner",
  "corrugating",
  "medium",
];

export function buildAdjustedCandidate(input: {
  baseCandidate: MatchingCandidate;
  adjustments: SchemeAdjustmentInput;
  paperMaterials: RecommendablePaperMaterial[];
}): ActionResult<MatchingCandidate> {
  const layerCount = input.adjustments.layerCount ?? input.baseCandidate.layerCount;
  const fluteType = input.adjustments.fluteType ?? input.baseCandidate.fluteType;
  const layersResult = buildAdjustedLayers({
    baseCandidate: input.baseCandidate,
    adjustments: input.adjustments,
    paperMaterials: input.paperMaterials,
  });

  if (!layersResult.ok) {
    return layersResult;
  }

  const paperIds = layersResult.data.map((layer) => layer.paper.id).join("-");

  return {
    ok: true,
    data: {
      id: `adjusted:${layerCount}:${fluteType}:${paperIds}`,
      layerCount,
      fluteType,
      layers: layersResult.data,
    },
  };
}

export function isCandidateManuallyAdjusted(input: {
  baseCandidate: MatchingCandidate;
  adjustedCandidate: MatchingCandidate;
}): boolean {
  if (
    input.baseCandidate.layerCount !== input.adjustedCandidate.layerCount ||
    input.baseCandidate.fluteType !== input.adjustedCandidate.fluteType ||
    input.baseCandidate.layers.length !== input.adjustedCandidate.layers.length
  ) {
    return true;
  }

  return input.baseCandidate.layers.some((baseLayer, index) => {
    const adjustedLayer = input.adjustedCandidate.layers[index];

    return (
      adjustedLayer === undefined ||
      baseLayer.role !== adjustedLayer.role ||
      baseLayer.flute !== adjustedLayer.flute ||
      baseLayer.paper.id !== adjustedLayer.paper.id
    );
  });
}

function buildAdjustedLayers(input: {
  baseCandidate: MatchingCandidate;
  adjustments: SchemeAdjustmentInput;
  paperMaterials: RecommendablePaperMaterial[];
}): ActionResult<CandidateLayer[]> {
  if (!input.adjustments.layers) {
    return {
      ok: true,
      data: input.baseCandidate.layers.map((layer) => ({
        ...layer,
        paper: { ...layer.paper },
      })),
    };
  }

  const paperMaterialById = new Map(
    input.paperMaterials.map((material) => [material.id, material]),
  );
  const layers: CandidateLayer[] = [];

  for (const adjustedLayer of input.adjustments.layers) {
    const validationResult = validateAdjustedLayer(adjustedLayer);

    if (!validationResult.ok) {
      return validationResult;
    }

    const paperMaterial = paperMaterialById.get(adjustedLayer.paperMaterialId);

    if (!paperMaterial?.isActive) {
      return {
        ok: false,
        error: {
          code: "DATA_NOT_FOUND",
          message: PAPER_NOT_FOUND_MESSAGE,
        },
      };
    }

    layers.push({
      role: adjustedLayer.role,
      ...(adjustedLayer.flute !== undefined ? { flute: adjustedLayer.flute } : {}),
      paper: toCandidatePaperMaterial(paperMaterial),
    });
  }

  return {
    ok: true,
    data: layers,
  };
}

function validateAdjustedLayer(
  adjustedLayer: SchemeAdjustmentLayerInput,
): ActionResult<true> {
  if (
    !VALID_LAYER_ROLES.includes(adjustedLayer.role) ||
    typeof adjustedLayer.paperMaterialId !== "string" ||
    adjustedLayer.paperMaterialId.trim() === ""
  ) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: INVALID_ADJUSTMENT_MESSAGE,
      },
    };
  }

  return {
    ok: true,
    data: true,
  };
}

function toCandidatePaperMaterial(material: RecommendablePaperMaterial): CandidatePaperMaterial {
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
