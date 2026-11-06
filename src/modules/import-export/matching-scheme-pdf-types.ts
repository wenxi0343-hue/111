import type {
  MatchingSchemeExportRecord,
  MatchingSchemeExportType,
} from "@/modules/import-export/matching-scheme-export-types";

export type MatchingSchemePdfExportType = Extract<
  MatchingSchemeExportType,
  "full_report" | "summary_sheet"
>;

export const matchingSchemePdfExportTypeLabels = {
  full_report: "完整报告",
  summary_sheet: "精简方案表",
} satisfies Record<MatchingSchemePdfExportType, string>;

export type { MatchingSchemeExportRecord };

export interface MatchingSchemePdfLabeledValue {
  label: string;
  value: string;
}

export interface MatchingSchemePdfPaperLayer {
  role: string;
  paperCode: string;
  paperName: string;
  factoryName: string;
  gramWeight: string;
}

export interface MatchingSchemePdfSchemeSummary {
  title: string;
  status: string;
  configuration: MatchingSchemePdfLabeledValue[];
  strength: MatchingSchemePdfLabeledValue[];
  cost: MatchingSchemePdfLabeledValue[];
  conclusion: string;
}

export interface MatchingSchemePdfSchemeDetail {
  configuration: MatchingSchemePdfLabeledValue[];
  paperLayers: MatchingSchemePdfPaperLayer[];
  strength: MatchingSchemePdfLabeledValue[];
  cost: MatchingSchemePdfLabeledValue[];
}

export interface MatchingSchemePdfData {
  type: MatchingSchemePdfExportType;
  title: "配纸方案报告" | "配纸方案表";
  fileName: string;
  schemeId: string;
  savedAt: Date;
  isManuallyAdjusted: boolean;
  boxSpec: Record<string, string>;
  originalRecommendations: MatchingSchemePdfSchemeSummary[];
  finalScheme: MatchingSchemePdfSchemeDetail;
  recommendationConclusion: string;
  exportVisibility: {
    showCost: boolean;
    showOriginalRecommendations: boolean;
  };
}

export function isMatchingSchemePdfExportType(
  value: string | null,
): value is MatchingSchemePdfExportType {
  return value === "full_report" || value === "summary_sheet";
}
