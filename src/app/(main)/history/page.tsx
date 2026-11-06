import { createDatabaseClient, getDatabaseUrl } from "@/db";
import { matchingSchemePdfExportTypeLabels } from "@/modules/import-export/matching-scheme-pdf-types";
import {
  matchingSchemeExportTypeLabels,
  type MatchingSchemeExportRecord,
} from "@/modules/import-export/matching-scheme-export-types";
import {
  createDrizzleMatchingSchemeHistoryRepository,
  listRecentMatchingSchemes,
  type MatchingSchemeHistorySummary,
} from "@/server/actions/matching-scheme-history";

import styles from "./history.module.css";

const finalStatusLabels: Record<string, string> = {
  qualified: "达标 / 可生产",
  unqualified: "未达标 / 不可生产",
  not_manufacturable: "不可生产",
  data_incomplete: "数据未补齐",
  unknown: "状态未知",
};

export default async function HistoryPage() {
  const historyResult = await loadRecentHistory();

  return (
    <section className={`page-section ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <h1>历史方案</h1>
          <p>这里保存最近 50 条确认后的配纸方案，最旧记录会自动移出列表。</p>
        </div>
        {historyResult.ok ? (
          <div className={styles.headerActions}>
            <span className={styles.count}>当前 {historyResult.data.length} 条</span>
          </div>
        ) : null}
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
                  <dt>方案来源</dt>
                  <dd>系统推荐</dd>
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

              {item.selectionReason ? (
                <section className={styles.selectionReason} aria-label="选型理由">
                  <div>
                    <span>选型理由</span>
                    <strong>{item.selectionReason.sourceLabel}</strong>
                  </div>
                  <p>{item.selectionReason.text}</p>
                </section>
              ) : null}

              {item.finalStatus === "qualified" ? (
                <div className={styles.exportLinks} aria-label="PDF 导出">
                  <a href={createMatchingSchemePdfExportHref(item.id, "full_report")}>
                    {matchingSchemePdfExportTypeLabels.full_report} PDF
                  </a>
                  <a href={createMatchingSchemePdfExportHref(item.id, "summary_sheet")}>
                    {matchingSchemePdfExportTypeLabels.summary_sheet} PDF
                  </a>
                  <a href={createMatchingSchemeExcelExportHref(item.id)}>Excel</a>
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
  return `${matchingSchemeExportTypeLabels[record.type]} ${formatDateTime(
    new Date(record.exportedAt),
  )}`;
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

function getStatusClassName(finalStatus: MatchingSchemeHistorySummary["finalStatus"]): string {
  if (finalStatus === "qualified") {
    return `${styles.statusBadge} ${styles.statusQualified}`;
  }

  if (finalStatus === "unqualified" || finalStatus === "not_manufacturable") {
    return `${styles.statusBadge} ${styles.statusRisk}`;
  }

  return `${styles.statusBadge} ${styles.statusNeutral}`;
}
