export type MatchingSchemeExportType =
  | "full_report"
  | "summary_sheet"
  | "scheme_excel";

export const matchingSchemeExportTypeLabels = {
  full_report: "完整报告",
  summary_sheet: "精简方案表",
  scheme_excel: "Excel",
} satisfies Record<MatchingSchemeExportType, string>;

export interface MatchingSchemeExportRecord {
  type: MatchingSchemeExportType;
  exportedAt: string;
}
