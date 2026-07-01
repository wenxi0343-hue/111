import type { PaperPriceNormalizedData } from "@/modules/import-export/master-data-workbook-parser";
import { matchPaperCodeExactly } from "@/modules/paper-code/match-paper-code";

export interface ExistingPaperMaterialForPriceMatch {
  id: string;
  paperCode: string;
  paperEncoding?: string | undefined;
  factoryName?: string | undefined;
  name: string;
  gramWeightGsm: number;
  priceYuanPerTon?: number | undefined;
}

export interface PaperMaterialMatchRule {
  sourceType: "paper_price_table";
  sourceSignature: string;
  paperMaterialId: string;
}

export type PaperPriceRowMatchResult =
  | { kind: "matched"; material: ExistingPaperMaterialForPriceMatch }
  | { kind: "pending"; candidates: ExistingPaperMaterialForPriceMatch[]; reason: string }
  | { kind: "failed"; reason: string };

const PAPER_PRICE_SOURCE_TYPE = "paper_price_table";

export function buildPaperPriceSourceSignature(normalizedData: PaperPriceNormalizedData): string {
  return [
    PAPER_PRICE_SOURCE_TYPE,
    normalizeComparableText(normalizedData.supplierShortName),
    normalizeComparableText(normalizedData.paperName),
    getPaperPriceRowGramWeight(normalizedData)?.toString() ?? "",
  ].join("|");
}

export function matchPaperPriceImportRow(input: {
  normalizedData: PaperPriceNormalizedData;
  existingMaterials: ExistingPaperMaterialForPriceMatch[];
  confirmedMatchRules: PaperMaterialMatchRule[];
}): PaperPriceRowMatchResult {
  const sourceSignature = buildPaperPriceSourceSignature(input.normalizedData);
  const confirmedRule = input.confirmedMatchRules.find(
    (rule) => rule.sourceType === PAPER_PRICE_SOURCE_TYPE && rule.sourceSignature === sourceSignature,
  );

  if (confirmedRule) {
    const confirmedMaterial = input.existingMaterials.find(
      (material) => material.id === confirmedRule.paperMaterialId,
    );

    if (confirmedMaterial) {
      return { kind: "matched", material: confirmedMaterial };
    }
  }

  const paperCodeMatchedMaterial = matchPaperCodeExactly(
    input.normalizedData.paperCode,
    input.existingMaterials,
  );

  if (paperCodeMatchedMaterial) {
    return { kind: "matched", material: paperCodeMatchedMaterial };
  }

  const paperEncodingMatchedMaterials = getPaperEncodingMatchedMaterials(
    input.normalizedData.paperEncoding,
    input.existingMaterials,
  );

  if (paperEncodingMatchedMaterials.length === 1) {
    const [material] = paperEncodingMatchedMaterials;

    if (material) {
      return { kind: "matched", material };
    }
  }

  if (paperEncodingMatchedMaterials.length > 1) {
    return {
      kind: "pending",
      candidates: paperEncodingMatchedMaterials,
      reason: "原纸编码匹配到多张原纸，请人工确认",
    };
  }

  const combinationMatchedMaterials = getCombinationMatchedMaterials(
    input.normalizedData,
    input.existingMaterials,
  );

  if (combinationMatchedMaterials.length === 1) {
    const [material] = combinationMatchedMaterials;

    if (material) {
      return { kind: "matched", material };
    }
  }

  if (combinationMatchedMaterials.length > 1) {
    return {
      kind: "pending",
      candidates: combinationMatchedMaterials,
      reason: "组合信息匹配到多张原纸，请人工确认",
    };
  }

  return { kind: "failed", reason: "无法关联原纸" };
}

function getPaperEncodingMatchedMaterials(
  paperEncoding: string | undefined,
  materials: ExistingPaperMaterialForPriceMatch[],
): ExistingPaperMaterialForPriceMatch[] {
  if (!paperEncoding) {
    return [];
  }

  return materials.filter((material) => material.paperEncoding === paperEncoding);
}

function getCombinationMatchedMaterials(
  normalizedData: PaperPriceNormalizedData,
  materials: ExistingPaperMaterialForPriceMatch[],
): ExistingPaperMaterialForPriceMatch[] {
  const supplierShortName = normalizeComparableText(normalizedData.supplierShortName);
  const paperName = normalizeComparableText(normalizedData.paperName);
  const gramWeightGsm = getPaperPriceRowGramWeight(normalizedData);

  if (!supplierShortName || !paperName || gramWeightGsm === undefined) {
    return [];
  }

  return materials.filter(
    (material) =>
      normalizeComparableText(material.factoryName) === supplierShortName &&
      normalizeComparableText(material.name) === paperName &&
      material.gramWeightGsm === gramWeightGsm,
  );
}

function getPaperPriceRowGramWeight(normalizedData: PaperPriceNormalizedData): number | undefined {
  if (normalizedData.gramWeightGsm !== undefined) {
    return normalizedData.gramWeightGsm;
  }

  return extractGramWeightFromPaperName(normalizedData.paperName);
}

function extractGramWeightFromPaperName(paperName: string | undefined): number | undefined {
  if (!paperName) {
    return undefined;
  }

  const match = paperName.match(/(?<gramWeight>\d{2,3})\s*g?/iu);
  const gramWeight = match?.groups?.gramWeight;

  if (!gramWeight) {
    return undefined;
  }

  const value = Number(gramWeight);

  return Number.isFinite(value) ? value : undefined;
}

function normalizeComparableText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}
