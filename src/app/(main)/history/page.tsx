import { createDatabaseClient, getDatabaseUrl } from "@/db";
import {
  matchingSchemePdfExportTypeLabels,
  type MatchingSchemeExportRecord,
} from "@/modules/import-export/matching-scheme-pdf-types";
import {
  createDrizzleMatchingSchemeHistoryRepository,
  listRecentMatchingSchemes,
  type MatchingSchemeHistorySummary,
} from "@/server/actions/matching-scheme-history";

import { HistoricalOrderImportPanel } from "./_components/historical-order-import-panel";
import styles from "./history.module.css";
import {
  listHistoricalOrderHabitSummaries,
} from "@/server/actions/historical-order-actions";
import type { ListHistoricalOrderHabitSummariesResult } from "@/modules/historical-orders/list-habit-summaries";

const finalStatusLabels: Record<string, string> = {
  qualified: "达标 / 可生产",
  unqualified: "未达标 / 不可生产",
  not_manufacturable: "不可生产",
  data_incomplete: "数据未补齐",
  unknown: "状态未知",
};

export default async function HistoryPage() {
  const historyResult = await loadRecentHistory();
  const habitSummaryResult = await listHistoricalOrderHabitSummaries({ limit: 30 });

  return (
    <section className={`page-section ${styles.page}`}>
      <HistoricalOrderImportPanel />

      <HistoricalOrderHabitSummarySection
        summaries={habitSummaryResult.ok ? habitSummaryResult.data.items : []}
        unavailable={!habitSummaryResult.ok}
      />

      <header className={styles.header}>
        <div>
          <h1>历史方案</h1>
          <p>这里保存最近 50 条确认后的配纸方案，最旧记录会自动移出列表。</p>
        </div>
        {historyResult.ok ? <span className={styles.count}>当前 {historyResult.data.length} 条</span> : null}
      </header>

      {!historyResult.ok ? (
        <div className={styles.emptyState}>历史方案暂时无法读取，请稍后重试。</div>
      ) : historyResult.data.length === 0 ? (
        <div className={styles.emptyState}>暂无历史方案。点击“确认保存”后，记录会出现在这里。</div>
      ) : (
        <div className={styles.historyList} aria-label="历史方案列表">
          {historyResult.data.map((item) => (
            <article className={styles.historyItem} key={item.id}>
              <div className={styles.itemMain}>
                <div>
                  <h2>记录 {shortenId(item.id)}</h2>
                  <p>保存时间 {formatDateTime(item.createdAt)}</p>
                </div>
                <span className={getStatusClassName(item.finalStatus)}>
                  {finalStatusLabels[item.finalStatus] ?? finalStatusLabels.unknown}
                </span>
              </div>

              <dl className={styles.meta}>
                <div>
                  <dt>调整状态</dt>
                  <dd>{item.isManuallyAdjusted ? "用户已手动调整" : "未手动调整"}</dd>
                </div>
                <div>
                  <dt>记录编号</dt>
                  <dd>{item.id}</dd>
                </div>
              </dl>

              {item.warningMessages.length > 0 ? (
                <ul className={styles.warnings} aria-label="风险提示">
                  {item.warningMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}

              {item.finalStatus === "qualified" ? (
                <div className={styles.exportLinks} aria-label="PDF 导出">
                  <a href={createMatchingSchemePdfExportHref(item.id, "full_report")}>
                    {matchingSchemePdfExportTypeLabels.full_report} PDF
                  </a>
                  <a href={createMatchingSchemePdfExportHref(item.id, "summary_sheet")}>
                    {matchingSchemePdfExportTypeLabels.summary_sheet} PDF
                  </a>
                </div>
              ) : null}

              {item.exportRecords.length > 0 ? (
                <ul className={styles.exportRecords} aria-label="导出记录">
                  {item.exportRecords.map((record) => (
                    <li key={`${record.type}-${record.exportedAt}`}>
                      {formatExportRecord(record)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoricalOrderHabitSummarySection({
  summaries,
  unavailable,
}: {
  summaries: ListHistoricalOrderHabitSummariesResult["items"];
  unavailable: boolean;
}) {
  const productSummaries = summaries.filter((summary) => summary.dimensionType === "product");
  const sizeSummaries = summaries.filter((summary) => summary.dimensionType === "size_bucket");
  const weightSummaries = summaries.filter((summary) => summary.dimensionType === "weight_bucket");

  return (
    <section aria-label="历史配纸习惯摘要" className={styles.habitSummarySection}>
      <div className={styles.habitSummaryHeading}>
        <h2>历史配纸习惯摘要</h2>
        <p>按已确认导入的可统计订单汇总常用组合，仅作为后续经验参考。</p>
      </div>

      {unavailable ? (
        <div className={styles.emptyState}>历史配纸习惯摘要暂时无法读取。</div>
      ) : summaries.length === 0 ? (
        <div className={styles.emptyState}>暂无历史配纸习惯摘要。</div>
      ) : (
        <div className={styles.habitSummaryGrid}>
          <HabitSummaryGroup title="产品习惯" items={productSummaries} />
          <HabitSummaryGroup title="尺寸区间习惯" items={sizeSummaries} />
          <HabitSummaryGroup title="重量区间习惯" items={weightSummaries} />
        </div>
      )}
    </section>
  );
}

function HabitSummaryGroup({
  title,
  items,
}: {
  title: string;
  items: ListHistoricalOrderHabitSummariesResult["items"];
}) {
  return (
    <section className={styles.habitSummaryGroup}>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className={styles.groupEmpty}>暂无记录</p>
      ) : (
        <ul className={styles.habitSummaryList}>
          {items.map((item) => (
            <li key={`${item.dimensionType}-${item.dimensionKey}-${item.layerCount}-${item.flute}`}>
              <div className={styles.habitSummaryMain}>
                <strong>{item.dimensionKey}</strong>
                <span>{formatHabitCombination(item)}</span>
              </div>
              <dl className={styles.habitSummaryMeta}>
                <div>
                  <dt>纸厂</dt>
                  <dd>{item.factoryNames.length > 0 ? item.factoryNames.join(" / ") : "-"}</dd>
                </div>
                <div>
                  <dt>克重</dt>
                  <dd>{formatGramWeights(item.gramWeights)}</dd>
                </div>
                <div>
                  <dt>次数</dt>
                  <dd>{item.orderCount} 次</dd>
                </div>
                <div>
                  <dt>频率</dt>
                  <dd>{formatFrequency(item.frequency)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatHabitCombination(
  item: ListHistoricalOrderHabitSummariesResult["items"][number],
): string {
  const layerText = item.layerCount !== undefined ? `${item.layerCount} 层` : "层数未识别";
  const fluteText = item.flute ? `${item.flute} 瓦` : "瓦型未识别";

  return `${layerText} / ${fluteText}`;
}

function formatGramWeights(gramWeights: number[]): string {
  if (gramWeights.length === 0) {
    return "-";
  }

  return gramWeights.map((gramWeight) => `${gramWeight}g`).join(" / ");
}

function formatFrequency(frequency: number): string {
  return `${Math.round(frequency * 100)}%`;
}

async function loadRecentHistory() {
  const databaseUrlResult = getDatabaseUrl();

  if (!databaseUrlResult.ok) {
    return databaseUrlResult;
  }

  const client = createDatabaseClient(databaseUrlResult.data);

  try {
    return await listRecentMatchingSchemes({
      repository: createDrizzleMatchingSchemeHistoryRepository(client.db),
      limit: 50,
    });
  } finally {
    await client.close();
  }
}

function shortenId(id: string): string {
  return id.slice(0, 8);
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function formatExportRecord(record: MatchingSchemeExportRecord): string {
  return `${matchingSchemePdfExportTypeLabels[record.type]} ${formatDateTime(
    new Date(record.exportedAt),
  )}`;
}

function createMatchingSchemePdfExportHref(
  schemeId: string,
  type: "full_report" | "summary_sheet",
): string {
  return `/api/exports/matching-schemes/${schemeId}?type=${type}`;
}

function getStatusClassName(finalStatus: MatchingSchemeHistorySummary["finalStatus"]): string {
  if (finalStatus === "qualified") {
    return `${styles.statusBadge} ${styles.statusQualified}`;
  }

  if (finalStatus === "unqualified" || finalStatus === "not_manufacturable") {
    return `${styles.statusBadge} ${styles.statusRisk}`;
  }

  return `${styles.statusBadge} ${styles.statusNeutral}`;
}
