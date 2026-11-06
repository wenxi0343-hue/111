export type StandardPaperKind = "linerboard" | "corrugating";

type QualityGrade = "premium" | "first" | "qualified";

interface StrengthStandardRange {
  minGsm: number;
  maxGsm: number;
  burstIndex: Record<QualityGrade, number>;
  ringCrushIndex: Record<QualityGrade, number>;
}

export interface ResolvedPaperStrengthStandard {
  burstIndex: number;
  ringCrushIndex: number;
}

export interface PaperStrengthStandardMissingReason {
  field: "grade" | "strengthStandard";
  message: string;
}

export interface PaperStrengthStandardResult {
  standard?: ResolvedPaperStrengthStandard | undefined;
  missingReason?: PaperStrengthStandardMissingReason | undefined;
}

const LINERBOARD_STANDARDS: StrengthStandardRange[] = [
  createRange(0, 124, [4.1, 3.7, 2.45], [13, 11, 9.5]),
  createRange(125, 159, [4, 3.6, 2.4], [13.5, 11.3, 9.8]),
  createRange(160, 199, [3.9, 3.45, 2.35], [14, 12.2, 10.2]),
  createRange(200, 249, [3.8, 3.35, 2.25], [14.5, 12.5, 10.5]),
  createRange(250, 299, [3.7, 3.25, 2.15], [15.5, 13, 11]),
  createRange(300, 500, [3.6, 3.15, 2.1], [16, 13.5, 11.5]),
];

const CORRUGATING_STANDARDS: StrengthStandardRange[] = [
  createRange(0, 90, [0.35, 0.32, 0.2], [8.1, 7.8, 7.4]),
  createRange(91, 139, [0.8, 0.65, 0.4], [8.6, 8.4, 7.7]),
  createRange(140, 179, [1.2, 1.1, 0.6], [9.5, 9.1, 8.7]),
  createRange(180, 249, [1.5, 1.3, 0.8], [10.9, 10.5, 10.1]),
];

export function resolvePaperStrengthStandard(input: {
  paperKind: string;
  grade?: string | undefined;
  gramWeightGsm: number;
}): PaperStrengthStandardResult {
  const paperKind = normalizeStandardPaperKind(input.paperKind);

  if (!paperKind) {
    return {};
  }

  const grade = normalizeQualityGrade(input.grade);

  if (!grade) {
    return {
      missingReason: {
        field: "grade",
        message: "缺少等级（优等品、一等品或合格品）",
      },
    };
  }

  const range = getStandardsForPaperKind(paperKind).find(
    (item) => input.gramWeightGsm >= item.minGsm && input.gramWeightGsm <= item.maxGsm,
  );

  if (!range) {
    return {
      missingReason: {
        field: "strengthStandard",
        message: `${input.gramWeightGsm}g 缺少对应的${paperKind === "linerboard" ? "箱板纸" : "瓦纸"}强度标准`,
      },
    };
  }

  return {
    standard: {
      burstIndex: range.burstIndex[grade],
      ringCrushIndex: range.ringCrushIndex[grade],
    },
  };
}

function createRange(
  minGsm: number,
  maxGsm: number,
  burstValues: [number, number, number],
  ringCrushValues: [number, number, number],
): StrengthStandardRange {
  return {
    minGsm,
    maxGsm,
    burstIndex: createGradeValues(burstValues),
    ringCrushIndex: createGradeValues(ringCrushValues),
  };
}

function createGradeValues(values: [number, number, number]): Record<QualityGrade, number> {
  return {
    premium: values[0],
    first: values[1],
    qualified: values[2],
  };
}

function getStandardsForPaperKind(paperKind: StandardPaperKind): StrengthStandardRange[] {
  return paperKind === "linerboard" ? LINERBOARD_STANDARDS : CORRUGATING_STANDARDS;
}

function normalizeStandardPaperKind(value: string): StandardPaperKind | undefined {
  if (value === "linerboard" || value === "corrugating") {
    return value;
  }

  return undefined;
}

function normalizeQualityGrade(value: string | undefined): QualityGrade | undefined {
  const text = value?.trim();

  if (!text) {
    return undefined;
  }

  if (text.includes("优等品") || text.includes("优等") || text === "优") {
    return "premium";
  }

  if (text.includes("一等品") || text.includes("一等") || text === "一") {
    return "first";
  }

  if (text.includes("合格品") || text.includes("合格")) {
    return "qualified";
  }

  return undefined;
}
