import { BOX_SPEC_LIMITS } from "@/modules/box-spec/constants";
import type { BoxFormingMethod } from "@/modules/box-spec/types";
import { calculateBoardArea } from "./calculate-area";
import type { FluteType, LayerCount } from "./types";

const flutes: Record<LayerCount, FluteType[]> = {
  3: ["A", "C", "B", "E"],
  5: ["BC", "BA", "AC", "BE"],
  7: ["BAC"],
};
const reductions: Record<LayerCount, number> = { 3: 8, 5: 10, 7: 14 };

export function calculateAreaOptions(input: {
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  dimensionType: "inner" | "outer";
  layerCount: LayerCount;
  formingMethod: BoxFormingMethod;
}):
  | { ok: true; results: { fluteType: FluteType; areaSquareMeters: number }[] }
  | { ok: false; message: string } {
  const offset = input.dimensionType === "outer" ? reductions[input.layerCount] : 0;
  const raw = [input.lengthMm, input.widthMm, input.heightMm];
  if (raw.some((value) => !value.trim() || !Number.isInteger(Number(value)))) {
    return { ok: false, message: "请输入完整的整数尺寸" };
  }
  const [lengthMm, widthMm, heightMm] = raw.map((value) => Number(value) - offset) as [
    number,
    number,
    number,
  ];
  if (
    lengthMm < BOX_SPEC_LIMITS.lengthMm.min ||
    lengthMm > BOX_SPEC_LIMITS.lengthMm.max ||
    widthMm < BOX_SPEC_LIMITS.widthMm.min ||
    widthMm > BOX_SPEC_LIMITS.widthMm.max ||
    heightMm < BOX_SPEC_LIMITS.heightMm.min ||
    heightMm > BOX_SPEC_LIMITS.heightMm.max ||
    lengthMm < widthMm ||
    lengthMm / widthMm > BOX_SPEC_LIMITS.lengthWidthRatio.max
  ) {
    return { ok: false, message: "换算后的内径不符合尺寸范围或长宽比例要求" };
  }
  const boxSpec = { lengthMm, widthMm, heightMm, formingMethod: input.formingMethod };
  return {
    ok: true,
    results: flutes[input.layerCount].map((fluteType) => ({
      fluteType,
      areaSquareMeters: calculateBoardArea({ boxSpec, layerCount: input.layerCount, fluteType })
        .areaSquareMeters,
    })),
  };
}
