"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

import { Alert, Button } from "antd";

import {
  previewHistoricalOrderImport,
  type PreviewHistoricalOrderImportResult,
} from "@/server/actions/historical-order-actions";

import styles from "../history.module.css";

type PreviewRow = PreviewHistoricalOrderImportResult["rows"][number];

export function HistoricalOrderImportPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewHistoricalOrderImportResult | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setPreviewResult(null);
    setErrorMessage(null);
  }

  async function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!selectedFile) {
      setErrorMessage("请先选择历史订单 .xlsx 文件");
      return;
    }

    const formData = new FormData();
    formData.set("file", selectedFile);
    setIsPreviewing(true);

    try {
      const result = await previewHistoricalOrderImport(formData);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setPreviewResult(result.data);
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <section aria-label="历史订单导入" className={styles.importWorkspace}>
      <form className={styles.uploadPanel} onSubmit={handlePreviewSubmit}>
        <div className={styles.uploadHeading}>
          <h2>历史订单导入</h2>
          <p>上传另存后的 `.xlsx` 订单文件，先查看字段识别、可统计数量和异常原因。</p>
        </div>

        {errorMessage ? <Alert showIcon title={errorMessage} type="error" /> : null}

        <label className={styles.importField} htmlFor="historical-order-workbook">
          <span>选择历史订单 .xlsx 文件</span>
          <input
            id="historical-order-workbook"
            name="file"
            type="file"
            accept=".xlsx"
            aria-label="选择历史订单 .xlsx 文件"
            onChange={handleFileChange}
          />
        </label>

        <div className={styles.importActions}>
          <Button
            aria-label="生成历史订单预览"
            htmlType="submit"
            loading={isPreviewing}
            type="primary"
          >
            生成历史订单预览
          </Button>
        </div>
      </form>

      <HistoricalOrderPreview preview={previewResult} />
    </section>
  );
}

function HistoricalOrderPreview({
  preview,
}: {
  preview: PreviewHistoricalOrderImportResult | null;
}) {
  const rows = preview?.rows ?? [];
  const pendingRows = rows.filter((row) => row.rowStatus === "pending");
  const exceptionRows = rows.filter((row) => row.rowStatus === "exception");
  const failedRows = rows.filter((row) => row.rowStatus === "failed");

  return (
    <section aria-label="历史订单导入预览" className={styles.previewRegion}>
      <div className={styles.previewHeading}>
        <h2>导入预览</h2>
        <p>预览只保存本次识别结果，确认导入会在后续步骤处理。</p>
      </div>

      {preview ? (
        <>
          <dl className={styles.summary}>
            <div>
              <dt>可入库</dt>
              <dd>可入库 {preview.summary.importedCount}</dd>
            </div>
            <div>
              <dt>可统计</dt>
              <dd>可统计 {preview.summary.statisticalCount}</dd>
            </div>
            <div>
              <dt>待确认</dt>
              <dd>待确认 {preview.summary.pendingCount}</dd>
            </div>
            <div>
              <dt>异常</dt>
              <dd>异常 {preview.summary.exceptionCount}</dd>
            </div>
            <div>
              <dt>失败</dt>
              <dd>失败 {preview.summary.failedCount}</dd>
            </div>
          </dl>

          <PreviewGroup title="待确认清单" rows={pendingRows} />
          <PreviewGroup title="异常清单" rows={exceptionRows} />
          <PreviewGroup title="失败清单" rows={failedRows} />
        </>
      ) : (
        <div className={styles.emptyState}>尚未生成历史订单预览</div>
      )}
    </section>
  );
}

function PreviewGroup({ title, rows }: { title: string; rows: PreviewRow[] }) {
  return (
    <section className={styles.previewGroup}>
      <h3>{title}</h3>
      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th>行号</th>
                <th>产品</th>
                <th>尺寸</th>
                <th>原始纸质</th>
                <th>原因</th>
                <th>候选原纸</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.sheetName}-${row.rowNumber}-${row.rowStatus}`}>
                  <td>{row.rowNumber}</td>
                  <td>{row.normalizedData.productName ?? "-"}</td>
                  <td>{formatSize(row)}</td>
                  <td>{row.normalizedData.paperCodeText ?? row.rawData["纸质"] ?? "-"}</td>
                  <td>{formatRowErrors(row)}</td>
                  <td>{formatCandidateCodes(row)}</td>
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

function formatSize(row: PreviewRow): string {
  const { lengthMm, widthMm, heightMm } = row.normalizedData;

  if (!lengthMm || !widthMm || !heightMm) {
    return "-";
  }

  return `${lengthMm}*${widthMm}*${heightMm}`;
}

function formatRowErrors(row: PreviewRow): string {
  return row.errors.length > 0 ? row.errors.map((error) => error.message).join("；") : "可入库";
}

function formatCandidateCodes(row: PreviewRow): string {
  const result = row.paperCodeMatchResult;

  if (result.status !== "case_mismatch" && result.status !== "ambiguous_case") {
    return "-";
  }

  return result.candidates.map((candidate) => candidate.paperCode).join(" / ");
}
