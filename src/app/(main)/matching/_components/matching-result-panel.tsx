import { Alert, Button } from "antd";

import type { CandidateEvaluation, MatchingCandidate } from "@/modules/calculations/types";
import { matchingSchemePdfExportTypeLabels } from "@/modules/import-export/matching-scheme-pdf-types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import type { MatchingSchemeFinalStatus } from "@/modules/scheme-adjustment/types";
import type {
  GenerateMatchingSchemeResult,
  SaveConfirmedMatchingSchemeResult,
} from "@/server/actions/matching-actions";

import styles from "../matching.module.css";

const recommendationStatusLabels: Record<RecommendationSlot["status"], string> = {
  recommended: "正式推荐",
  repeated: "重复推荐",
  unavailable: "不可用",
  reference: "参考方案",
};

const finalStatusLabels: Record<MatchingSchemeFinalStatus, string> = {
  qualified: "达标",
  unqualified: "未达标",
  not_manufacturable: "不可生产",
  data_incomplete: "数据不足",
};

interface MatchingResultPanelProps {
  canSave: boolean;
  isSaving: boolean;
  matchingResult: GenerateMatchingSchemeResult;
  onSave: () => void;
  onSelectStrategy: (strategy: RecommendationSlot["strategy"]) => void;
  savedResult: SaveConfirmedMatchingSchemeResult | null;
  selectedStrategy: RecommendationSlot["strategy"] | null;
}

export function MatchingResultPanel({
  canSave,
  isSaving,
  matchingResult,
  onSave,
  onSelectStrategy,
  savedResult,
  selectedStrategy,
}: MatchingResultPanelProps) {
  return (
    <section className={styles.resultPanel} aria-label="生成结果">
      <h3 className={styles.resultTitle}>生成结果</h3>
      <dl className={styles.resultList}>
        <div>
          <dt>计算面积</dt>
          <dd>{getGeneratedAreaText(matchingResult)}</dd>
        </div>
      </dl>

      <section className={styles.resultSection} aria-label="推荐方案">
        <h4 className={styles.resultSubtitle}>推荐方案</h4>
        {matchingResult.recommendationMessages.map((message) => (
          <Alert key={message} showIcon title={message} type="warning" />
        ))}
        {selectedStrategy ? (
          <p className={styles.finalSchemeText}>
            当前最终方案：{getRecommendationTitle(matchingResult, selectedStrategy)}
          </p>
        ) : null}
        <div className={styles.candidateGrid}>
          {matchingResult.recommendationSlots.map((slot) => (
            <article
              className={`${styles.candidateItem} ${
                selectedStrategy === slot.strategy ? styles.selectedCandidateItem : ""
              }`}
              data-testid={`recommendation-slot-${slot.strategy}`}
              key={slot.strategy}
            >
              <div className={styles.candidateTopline}>
                <div className={styles.candidateTitleGroup}>
                  <h5>{slot.title}</h5>
                  <p>
                    {slot.evaluation
                      ? formatCandidateTitle(slot.evaluation.candidate)
                      : "暂无可用方案"}
                  </p>
                </div>
                <span className={styles.statusBadge}>
                  {recommendationStatusLabels[slot.status]}
                </span>
              </div>
              {slot.evaluation ? (
                <>
                  <ul className={styles.quickMetricList} aria-label={`${slot.title}关键指标`}>
                    {formatQuickEvaluationMetrics(slot.evaluation).map((metric) => (
                      <li key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </li>
                    ))}
                  </ul>
                  <section
                    className={styles.paperSummaryPanel}
                    aria-label={`${slot.title}原纸组合`}
                  >
                    <span>原纸组合</span>
                    <ul>
                      {formatPaperLayerDetails(slot.evaluation.candidate).map((layer) => (
                        <li key={layer.key}>{layer.text}</li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : (
                <p className={styles.unavailableText}>暂无可选候选</p>
              )}
              <details
                className={styles.recommendationDetails}
                data-testid={`recommendation-details-${slot.strategy}`}
              >
                <summary className={styles.recommendationSummary}>
                  <span>查看要求和理由</span>
                  <span className={styles.expandHint}>展开</span>
                </summary>
                {slot.selectionReason ? (
                  <SelectionReasonPanel
                    fallbackText={getFallbackReasonText(slot)}
                    selectionReason={slot.selectionReason}
                  />
                ) : (
                  <section className={styles.selectionReasonPanel} aria-label="选型理由">
                    <div className={styles.selectionReasonHeader}>
                      <span>选型理由</span>
                      <span className={styles.selectionReasonBadge}>系统规则</span>
                    </div>
                    <p className={styles.selectionReasonText}>{getFallbackReasonText(slot)}</p>
                  </section>
                )}
              </details>
              {slot.evaluation ? (
                <Button
                  aria-label={`选择${slot.title}`}
                  block
                  onClick={() => onSelectStrategy(slot.strategy)}
                  type={selectedStrategy === slot.strategy ? "primary" : "default"}
                >
                  选择
                </Button>
              ) : null}
            </article>
          ))}
        </div>
        {savedResult ? <SavedSchemeSummary savedResult={savedResult} /> : null}
        <div className={styles.actions}>
          <Button disabled={!canSave} loading={isSaving} onClick={onSave} type="primary">
            确认保存
          </Button>
        </div>
      </section>

      {matchingResult.rejectedSummary.length > 0 ? (
        <section className={styles.resultSection} aria-label="不推荐原因汇总">
          <h4 className={styles.resultSubtitle}>不推荐原因汇总</h4>
          <ul className={styles.summaryList}>
            {matchingResult.rejectedSummary.map((summary) => (
              <li key={summary.type}>
                {summary.label} {summary.count}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function SelectionReasonPanel({
  fallbackText,
  selectionReason,
}: {
  fallbackText?: string | undefined;
  selectionReason: NonNullable<RecommendationSlot["selectionReason"]>;
}) {
  const displayText = getSelectionReasonDisplayText(selectionReason.text, fallbackText);

  return (
    <section className={styles.selectionReasonPanel} aria-label="选型理由">
      <div className={styles.selectionReasonHeader}>
        <span>选型理由</span>
        <span className={styles.selectionReasonBadge}>{selectionReason.sourceLabel}</span>
      </div>
      <p className={styles.selectionReasonText}>{displayText}</p>
    </section>
  );
}

function SavedSchemeSummary({ savedResult }: { savedResult: SaveConfirmedMatchingSchemeResult }) {
  return (
    <section aria-label="保存结果" className={styles.savedPanel} data-testid="saved-scheme-summary">
      <h5>保存结果</h5>
      <ul className={styles.metricList}>
        <li>保存状态 保存成功</li>
        <li>最终状态 {finalStatusLabels[savedResult.finalStatus]}</li>
        <li>系统推荐方案</li>
        <li>保存时间 {savedResult.savedAt}</li>
        <li>记录编号 {savedResult.schemeId}</li>
      </ul>
      {savedResult.warningMessages.length > 0 ? (
        <ul className={styles.reasonList}>
          {savedResult.warningMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.exportLinks} aria-label="PDF 导出">
        <a href={createMatchingSchemePdfExportHref(savedResult.schemeId, "full_report")}>
          {matchingSchemePdfExportTypeLabels.full_report} PDF
        </a>
        <a href={createMatchingSchemePdfExportHref(savedResult.schemeId, "summary_sheet")}>
          {matchingSchemePdfExportTypeLabels.summary_sheet} PDF
        </a>
        <a href={createMatchingSchemeExcelExportHref(savedResult.schemeId)}>Excel</a>
      </div>
    </section>
  );
}

function getRecommendationTitle(
  result: GenerateMatchingSchemeResult,
  selectedStrategy: RecommendationSlot["strategy"],
): string {
  return result.recommendationSlots.find((slot) => slot.strategy === selectedStrategy)?.title ?? "";
}

function formatCandidateTitle(candidate: MatchingCandidate): string {
  return `${candidate.layerCount} 层 ${candidate.fluteType} 楞`;
}

function getGeneratedAreaText(result: GenerateMatchingSchemeResult): string {
  const area =
    result.recommendationSlots.find((slot) => slot.evaluation?.area)?.evaluation?.area ??
    result.rejectedCandidates.find((candidate) => candidate.area)?.area;

  return area ? `${formatDecimal(area.areaSquareMeters, 4)} m²` : "暂无面积结果";
}

function formatPaperLayerDetails(
  candidate: MatchingCandidate,
): Array<{ key: string; text: string }> {
  return candidate.layers.map((layer, index) => {
    const gramWeightText =
      layer.paper.gramWeightGsm === null || layer.paper.gramWeightGsm === undefined
        ? "-"
        : `${layer.paper.gramWeightGsm}g`;
    const factoryText = layer.paper.factoryName ? ` / ${layer.paper.factoryName}` : "";

    return {
      key: `${layer.role}-${index}-${layer.paper.paperCode}`,
      text: `${getLayerRoleLabel(layer)}：${layer.paper.paperCode} / ${gramWeightText}${factoryText}`,
    };
  });
}

function formatQuickEvaluationMetrics(
  evaluation: CandidateEvaluation,
): Array<{ label: string; value: string }> {
  return [
    evaluation.cost
      ? {
          label: "含税成本",
          value: `${formatDecimal(evaluation.cost.taxIncludedCostYuan, 2)} 元`,
        }
      : null,
    evaluation.strength
      ? {
          label: "边压",
          value: `${formatDecimal(evaluation.strength.edgeCrushKnPerM, 2)} kN/m`,
        }
      : null,
    evaluation.strength ? { label: "空箱抗压", value: `${evaluation.strength.bctN} N` } : null,
    evaluation.strength ? { label: "耐破", value: `${evaluation.strength.burstStrength}` } : null,
  ].filter((metric): metric is { label: string; value: string } => Boolean(metric));
}

function getFallbackReasonText(slot: RecommendationSlot): string {
  if (slot.status === "unavailable") {
    return "当前方案位置暂无可用候选，请查看不足原因。";
  }

  if (slot.status === "reference") {
    return "当前没有达标可生产方案，该方案仅供调整参考。";
  }

  if (slot.strategy === "standard") {
    return "标准方案优先选择质量稳妥不过量、三项强度短板处于合理富余区间的配置。";
  }

  if (slot.strategy === "cost_down") {
    return "降本方案在达标前提下必须低于标准方案成本，优先从同档低价厂家、芯纸和瓦纸小幅降本。";
  }

  if (slot.strategy === "enhanced") {
    return "增强方案仅在特殊要求下输出，优先提高三项强度短板和面里纸等级。";
  }

  if (slot.strategy === "economy") {
    return "在达标且可生产的候选中，优先选择成本更低的方案。";
  }

  if (slot.strategy === "safety") {
    return "在达标且可生产的候选中，优先选择安全冗余更高的方案。";
  }

  return "按成本和安全综合表现选择相对平衡的方案。";
}

const selectionReasonDataPrefixes = ["成本：", "强度：", "可生产状态："];
const nonActionableRiskTexts = new Set(["风险提示：当前未发现强度或设备风险。"]);

function getSelectionReasonDisplayText(text: string, fallbackText?: string | undefined): string {
  const reasonLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !selectionReasonDataPrefixes.some((prefix) => line.startsWith(prefix)));

  if (reasonLines.length === 0) {
    return fallbackText ?? text;
  }

  const firstReasonLine = reasonLines[0];
  if (reasonLines.length === 1 && firstReasonLine && nonActionableRiskTexts.has(firstReasonLine)) {
    return fallbackText ?? firstReasonLine;
  }

  return reasonLines.join("\n");
}

function getLayerRoleLabel(layer: MatchingCandidate["layers"][number]): string {
  if (layer.role === "outer_liner") {
    return "面纸";
  }

  if (layer.role === "inner_liner") {
    return "里纸";
  }

  if (layer.role === "corrugating") {
    return layer.flute ? `${layer.flute}瓦` : "瓦型";
  }

  return "芯纸";
}

function formatDecimal(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
}

function createMatchingSchemePdfExportHref(
  schemeId: string,
  type: "full_report" | "summary_sheet",
): string {
  return `/api/exports/matching-schemes/${schemeId}?type=${type}`;
}

function createMatchingSchemeExcelExportHref(schemeId: string): string {
  return `/api/exports/matching-schemes/${schemeId}/excel`;
}
