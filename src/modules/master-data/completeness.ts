export type PaperMaterialCompletenessStatus = "complete" | "incomplete";

export interface PaperMaterialCompletenessInput {
  paperCode?: string | undefined;
  factoryName?: string | undefined;
  paperName?: string | undefined;
  gramWeightGsm?: number | undefined;
  paperKind?: string | undefined;
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
  usage?: string | undefined;
  applicableFlutes?: string[] | undefined;
}

export interface PaperMaterialCompleteness {
  status: PaperMaterialCompletenessStatus;
  missingFields: string[];
}

export function calculatePaperMaterialCompleteness(
  input: PaperMaterialCompletenessInput,
): PaperMaterialCompleteness {
  const missingFields: string[] = [];

  if (!input.paperCode) {
    missingFields.push("paperCode");
  }

  if (!input.factoryName) {
    missingFields.push("factoryName");
  }

  if (!input.paperName) {
    missingFields.push("paperName");
  }

  if (input.gramWeightGsm === undefined) {
    missingFields.push("gramWeightGsm");
  }

  if (!input.paperKind || input.paperKind === "unknown") {
    missingFields.push("paperKind");
  }

  if (input.priceYuanPerTon === undefined) {
    missingFields.push("priceYuanPerTon");
  }

  if (input.burstIndex === undefined) {
    missingFields.push("burstIndex");
  }

  if (input.ringCrushIndex === undefined) {
    missingFields.push("ringCrushIndex");
  }

  return {
    status: missingFields.length === 0 ? "complete" : "incomplete",
    missingFields,
  };
}
