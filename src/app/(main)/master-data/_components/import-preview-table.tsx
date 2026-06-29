import type { PreviewMasterDataImportResult } from "@/server/actions/master-data-actions";

import styles from "../master-data.module.css";

interface ImportPreviewTableProps {
  preview: PreviewMasterDataImportResult | null;
}

type PreviewRow = PreviewMasterDataImportResult["rows"][number];

const missingFieldLabels: Record<string, string> = {
  paperCode: "原纸代码",
  factoryName: "纸厂",
  paperName: "原纸名称",
  gramWeightGsm: "克重",
  paperKind: "纸类",
  priceYuanPerTon: "纸价",
  burstIndex: "耐破指数",
  ringCrushIndex: "横向环压指数",
};

export function ImportPreviewTable({ preview }: ImportPreviewTableProps) {
  const rows = preview?.rows ?? [];
  const failedRows = rows.filter((row) => row.rowStatus === "failed");
  const newRows = rows.filter((row) => row.rowStatus === "new");
  const updateRows = rows.filter((row) => row.rowStatus === "update");
  const incompleteRows = rows.filter((row) => row.completenessStatus === "incomplete");

  return (
    <section aria-label="导入预览" className={styles.previewRegion}>
      <div className={styles.previewHeading}>
        <h2>导入预览</h2>
        <p>预览确认后才会正式写入资料库。</p>
      </div>

      {preview ? (
        <>
          <dl className={styles.summary}>
            <div>
              <dt>新增</dt>
              <dd>新增 {preview.summary.newCount}</dd>
            </div>
            <div>
              <dt>更新</dt>
              <dd>更新 {preview.summary.updateCount}</dd>
            </div>
            <div>
              <dt>待确认</dt>
              <dd>待确认 {preview.summary.pendingCount}</dd>
            </div>
            <div>
              <dt>失败</dt>
              <dd>失败 {preview.summary.failedCount}</dd>
            </div>
            <div>
              <dt>资料不完整</dt>
              <dd>资料不完整 {preview.summary.incompleteCount}</dd>
            </div>
          </dl>

          <PreviewGroup title="新增清单" rows={newRows} />
          <PreviewGroup title="更新清单" rows={updateRows} />
          <PreviewGroup title="失败清单" rows={failedRows} />
          <PreviewGroup title="资料不完整" rows={incompleteRows} showMissingFields />
        </>
      ) : (
        <div className={styles.emptyState}>尚未生成预览</div>
      )}
    </section>
  );
}

function PreviewGroup({
  title,
  rows,
  showMissingFields = false,
}: {
  title: string;
  rows: PreviewRow[];
  showMissingFields?: boolean;
}) {
  return (
    <section className={styles.previewGroup}>
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th>行号</th>
                <th>原纸代码</th>
                <th>原纸名称</th>
                <th>供应商</th>
                <th>克重</th>
                <th>提示</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.sheetName}-${row.rowNumber}-${row.rowStatus}`}>
                  <td>{row.rowNumber}</td>
                  <td>{row.normalizedData.paperCode || "-"}</td>
                  <td>{row.normalizedData.paperName || "-"}</td>
                  <td>{row.factoryName || row.normalizedData.supplierShortName || "-"}</td>
                  <td>
                    {row.normalizedData.gramWeightGsm === undefined
                      ? "-"
                      : `${row.normalizedData.gramWeightGsm}g`}
                  </td>
                  <td>{formatRowMessages(row, showMissingFields)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.groupEmpty}>暂无记录</p>
      )}
    </section>
  );
}

function formatRowMessages(row: PreviewRow, showMissingFields: boolean): string {
  const messages = [
    ...row.errors.map((error) => error.message),
    ...row.warnings.map((warning) => warning.message),
  ];

  if (showMissingFields) {
    messages.push(...row.missingFields.map((field) => `缺少${missingFieldLabels[field] ?? field}`));
  }

  return messages.length > 0 ? messages.join("；") : "可入库";
}
