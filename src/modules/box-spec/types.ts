export type BoxFormingMethod = "glue" | "staple";

export type ProductArrangement = "single_row" | "double_row" | "staggered";

export type ProductType =
  | "食品"
  | "日化"
  | "电子"
  | "五金"
  | "服装"
  | "普通产品"
  | "贵重物品"
  | "其他";

export interface BoxSpecialRequirements {
  dieCutting: boolean;
  punctureStrengthRequired: boolean;
  notes?: string | undefined;
}

export interface BoxSpecialRequirementsInput {
  dieCutting?: boolean | undefined;
  punctureStrengthRequired?: boolean | undefined;
  notes?: string | undefined;
}

export interface BoxSpecInput {
  lengthMm: number | string | undefined;
  widthMm: number | string | undefined;
  heightMm: number | string | undefined;
  structureType: string | undefined;
  formingMethod: BoxFormingMethod | string | undefined;
  productType: string | undefined;
  productWeightKg: number | string | undefined;
  arrangement: ProductArrangement | string | undefined;
  specialRequirements?: BoxSpecialRequirementsInput | string | undefined;
  productionQuantity: number | string | undefined;
  stackingLayers?: number | string | undefined;
}

export interface NotRequiredStackingRequirement {
  status: "not_required";
  displayText: "未填写堆码层数，承重未校核";
}

export interface RequiredStackingRequirement {
  status: "required";
  stackingLayers: number;
  displayText: string;
}

export type StackingRequirement = NotRequiredStackingRequirement | RequiredStackingRequirement;

export interface NormalizedBoxSpec {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  structureType: string;
  formingMethod: BoxFormingMethod;
  productType: ProductType;
  productWeightKg: number;
  arrangement: ProductArrangement;
  specialRequirements: BoxSpecialRequirements;
  productionQuantity: number;
  stackingRequirement: StackingRequirement;
}

export type BoxSpecField = keyof BoxSpecInput | "baseData";

export interface BoxSpecFieldError {
  field: BoxSpecField;
  message: string;
}

export type BoxSpecValidationResult =
  | { ok: true; data: NormalizedBoxSpec }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
        fieldErrors: BoxSpecFieldError[];
      };
    };
