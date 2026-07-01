import type { NormalizedBoxSpec } from "@/modules/box-spec/types";

import { DEFAULT_CALCULATION_PARAMETERS } from "./default-parameters";
import type { BoardAreaResult, FluteType, LayerCount } from "./types";

interface AreaRule {
  innerReductionMm: number;
  tongueMm: number;
  flapExtraMm: number;
  boardWidthAllowanceMm: number;
  lengthPanelAllowancesMm: readonly [number, number, number, number];
}

export function calculateBoardArea(input: {
  boxSpec: NormalizedBoxSpec;
  layerCount: LayerCount;
  fluteType: FluteType;
}): BoardAreaResult {
  const { boxSpec, layerCount, fluteType } = input;
  const rule = getAreaRule({
    formingMethod: boxSpec.formingMethod,
    layerCount,
    fluteType,
  });

  const innerLengthMm = boxSpec.lengthMm - rule.innerReductionMm;
  const innerWidthMm = boxSpec.widthMm - rule.innerReductionMm;
  const innerHeightMm = boxSpec.heightMm - rule.innerReductionMm;
  const flapMm = (innerWidthMm + rule.flapExtraMm) / 2;

  const onePiece = buildAreaResult({
    innerLengthMm,
    innerWidthMm,
    innerHeightMm,
    flapMm,
    tongueMm: rule.tongueMm,
    boardWidthAllowanceMm: rule.boardWidthAllowanceMm,
    lengthPanelAllowancesMm: rule.lengthPanelAllowancesMm,
    formingPieces: 1,
  });

  if (
    layerCount === 7 &&
    onePiece.boardWidthMm > DEFAULT_CALCULATION_PARAMETERS.deviceLimits.boardMachine.maxWidthMm
  ) {
    return buildAreaResult({
      innerLengthMm,
      innerWidthMm,
      innerHeightMm,
      flapMm,
      tongueMm: rule.tongueMm,
      boardWidthAllowanceMm: rule.boardWidthAllowanceMm,
      lengthPanelAllowancesMm: [rule.lengthPanelAllowancesMm[0], rule.lengthPanelAllowancesMm[1]],
      formingPieces: 2,
    });
  }

  return onePiece;
}

function getAreaRule({
  formingMethod,
  layerCount,
  fluteType,
}: {
  formingMethod: NormalizedBoxSpec["formingMethod"];
  layerCount: LayerCount;
  fluteType: FluteType;
}): AreaRule {
  if (layerCount === 3) {
    return {
      innerReductionMm: 8,
      tongueMm: formingMethod === "staple" ? 40 : 35,
      flapExtraMm: fluteType === "C" || fluteType === "BE" ? 10 : 8,
      boardWidthAllowanceMm: 6,
      lengthPanelAllowancesMm: [4, 7, 7, 4],
    };
  }

  if (layerCount === 5) {
    return {
      innerReductionMm: 10,
      tongueMm: formingMethod === "staple" ? 45 : 40,
      flapExtraMm: 12,
      boardWidthAllowanceMm: 8,
      lengthPanelAllowancesMm: [5, 8, 8, 5],
    };
  }

  return {
    innerReductionMm: 14,
    tongueMm: 45,
    flapExtraMm: 16,
    boardWidthAllowanceMm: 10,
    lengthPanelAllowancesMm: [7, 10, 10, 7],
  };
}

function buildAreaResult({
  innerLengthMm,
  innerWidthMm,
  innerHeightMm,
  flapMm,
  tongueMm,
  boardWidthAllowanceMm,
  lengthPanelAllowancesMm,
  formingPieces,
}: {
  innerLengthMm: number;
  innerWidthMm: number;
  innerHeightMm: number;
  flapMm: number;
  tongueMm: number;
  boardWidthAllowanceMm: number;
  lengthPanelAllowancesMm: readonly [number, number, number, number] | readonly [number, number];
  formingPieces: 1 | 2;
}): BoardAreaResult {
  const [
    firstLengthAllowance,
    firstWidthAllowance,
    secondLengthAllowance = 0,
    secondWidthAllowance = 0,
  ] = lengthPanelAllowancesMm;
  const panels =
    formingPieces === 1
      ? [
          innerLengthMm + firstLengthAllowance,
          innerWidthMm + firstWidthAllowance,
          innerLengthMm + secondLengthAllowance,
          innerWidthMm + secondWidthAllowance,
        ]
      : [
          innerLengthMm + firstLengthAllowance,
          innerWidthMm + firstWidthAllowance,
        ];
  const boardLengthMm = tongueMm + panels.reduce((total, panel) => total + panel, 0);
  const boardWidthMm =
    formingPieces === 1
      ? flapMm * 2 + innerHeightMm + boardWidthAllowanceMm
      : flapMm + innerHeightMm + boardWidthAllowanceMm;

  return {
    innerLengthMm,
    innerWidthMm,
    innerHeightMm,
    boardLengthMm,
    boardWidthMm,
    feedLengthMm: boardLengthMm,
    feedWidthMm: boardWidthMm,
    printLengthMm: boardLengthMm,
    printWidthMm: boardWidthMm,
    slotIntervalsMm: {
      firstPanel: innerLengthMm,
      firstSlot: innerWidthMm,
      secondPanel: innerLengthMm,
      secondSlot: innerWidthMm,
    },
    areaSquareMeters: (boardLengthMm * boardWidthMm * formingPieces) / 1_000_000,
    formingPieces,
    flapMm,
    tongueMm,
  };
}
