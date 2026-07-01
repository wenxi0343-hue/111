import type { BoxFormingMethod, ProductArrangement } from "./types";

export const BOX_SPEC_LIMITS = {
  lengthMm: { min: 100, max: 2000 },
  widthMm: { min: 100, max: 1500 },
  heightMm: { min: 100, max: 1500 },
  productWeightKg: { min: 0.5, max: 100 },
  stackingLayers: { min: 1, max: 30 },
  lengthWidthRatio: { min: 1, max: 5 },
} as const;

export const BOX_FORMING_METHODS = ["glue", "staple"] as const satisfies readonly BoxFormingMethod[];

export const PRODUCT_ARRANGEMENTS = [
  "single_row",
  "double_row",
  "staggered",
] as const satisfies readonly ProductArrangement[];

export const STACKING_NOT_REQUIRED_DISPLAY_TEXT = "未填写堆码层数，承重未校核" as const;
