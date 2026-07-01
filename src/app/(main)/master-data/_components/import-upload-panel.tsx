"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

import { Alert, Button } from "antd";

import {
  confirmMasterDataImport,
  listPaperMaterials,
  previewMasterDataImport,
  resolveMasterDataImportRow,
  type PreviewMasterDataImportResult,
} from "@/server/actions/master-data-actions";

import { ImportPreviewTable } from "./import-preview-table";
import {
  PendingMatchTable,
  type PendingMatchCandidateView,
  type PendingMatchRowView,
} from "./pending-match-table";
import styles from "../master-data.module.css";

type ImportSourceType = "paper_code_table" | "paper_price_table" | "quality_standard_table";

const PAPER_CODE_SOURCE_TYPE = "paper_code_table";

const importSourceOptions: Array<{ value: ImportSourceType; label: string; fileLabel: string }> = [
  { value: "paper_code_table", label: "原纸代码表", fileLabel: "选择原纸代码表" },
  { value: "paper_price_table", label: "纸价表", fileLabel: "选择纸价表" },
  { value: "quality_standard_table", label: "物理指标/标准表", fileLabel: "选择物理指标/标准表" },
];
const defaultImportSourceOption = importSourceOptions[0] ?? {
  value: "paper_code_table",
  label: "原纸代码表",
  fileLabel: "选择原纸代码表",
};

interface ImportUploadPanelProps {
  onImportConfirmed?: (() => void) | undefined;
}

export function ImportUploadPanel({ onImportConfirmed }: ImportUploadPanelProps) {
  const [sourceType, setSourceType] = useState<ImportSourceType>("paper_code_table");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewMasterDataImportResult | null>(null);
  const [candidateMaterials, setCandidateMaterials] = useState<PendingMatchCandidateView[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const selectedSourceOption =
    importSourceOptions.find((option) => option.value === sourceType) ?? defaultImportSourceOption;
  const pendingRows = buildPendingMatchRows(previewResult);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setPreviewResult(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function handleSourceTypeChange(nextSourceType: ImportSourceType) {
    setSourceType(nextSourceType);
    setSelectedFile(null);
    setPreviewResult(null);
    setCandidateMaterials([]);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  async function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!selectedFile) {
      setErrorMessage(`请先${selectedSourceOption.fileLabel}`);
      return;
    }

    const formData = new FormData();
    formData.set("sourceType", sourceType);
    formData.set("file", selectedFile);
    setIsPreviewing(true);

    try {
      const result = await previewMasterDataImport(formData);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setPreviewResult(result.data);
      await loadCandidateMaterialsIfNeeded(result.data);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!previewResult) {
      return;
    }

    setSuccessMessage(null);
    setErrorMessage(null);
    setIsConfirming(true);

    try {
      const result = await confirmMasterDataImport(previewResult.batchId);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      onImportConfirmed?.();
      setSuccessMessage(
        `入库完成：新增 ${result.data.createdMaterialCount} 张原纸，更新 ${result.data.updatedMaterialCount} 张原纸，跳过 ${result.data.skippedFailedRowCount} 行。`,
      );
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleResolvePendingRow(input: {
    rowId: string;
    paperMaterialId: string;
  }): Promise<void> {
    if (!previewResult) {
      return;
    }

    setErrorMessage(null);
    const result = await resolveMasterDataImportRow({
      batchId: previewResult.batchId,
      rowId: input.rowId,
      paperMaterialId: input.paperMaterialId,
    });

    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }

    setPreviewResult((current) =>
      current
        ? {
            ...current,
            summary: {
              ...current.summary,
              pendingCount: Math.max(0, current.summary.pendingCount - 1),
              updateCount: current.summary.updateCount + 1,
            },
            rows: current.rows.map((row) =>
              row.id === input.rowId
                ? {
                    ...row,
                    rowStatus: "update",
                    targetMaterialId: input.paperMaterialId,
                    errors: [],
                  }
                : row,
            ),
          }
        : current,
    );
  }

  async function loadCandidateMaterialsIfNeeded(preview: PreviewMasterDataImportResult) {
    const hasPendingRows = preview.rows.some((row) => row.rowStatus === "pending");

    if (!hasPendingRows) {
      setCandidateMaterials([]);
      return;
    }

    const result = await listPaperMaterials({ page: 1, pageSize: 200 });

    if (!result.ok) {
      setErrorMessage(result.error.message);
      return;
    }

    setCandidateMaterials(
      result.data.items.map((item) => ({
        id: item.id,
        paperCode: item.paperCode,
        name: item.name,
        factoryName: item.factoryName,
        gramWeightGsm: item.gramWeightGsm,
      })),
    );
  }

  return (
    <div className={styles.importWorkspace}>
      <form
        aria-label="原纸代码表导入表单"
        className={styles.uploadPanel}
        onSubmit={handlePreviewSubmit}
      >
        <div className={styles.uploadHeading}>
          <h2>原纸代码表导入</h2>
          <p>用于建立原纸基础档案，原纸编码只作为辅助字段。</p>
        </div>

        {errorMessage ? <Alert showIcon title={errorMessage} type="error" /> : null}
        {successMessage ? <Alert showIcon title={successMessage} type="success" /> : null}

        <label className={styles.importField} htmlFor="master-data-source-type">
          <span>导入来源</span>
          <select
            id="master-data-source-type"
            name="sourceType"
            aria-label="导入来源"
            value={sourceType}
            onChange={(event) => handleSourceTypeChange(event.target.value as ImportSourceType)}
          >
            <option value={PAPER_CODE_SOURCE_TYPE}>原纸代码表</option>
            <option value="paper_price_table">纸价表</option>
            <option value="quality_standard_table">物理指标/标准表</option>
          </select>
        </label>

        <label className={styles.importField} htmlFor="paper-code-workbook">
          <span>{selectedSourceOption.fileLabel}</span>
          <input
            id="paper-code-workbook"
            name="file"
            type="file"
            accept={sourceType === "paper_code_table" ? ".xlsx,.csv" : ".xlsx"}
            aria-label={selectedSourceOption.fileLabel}
            onChange={handleFileChange}
          />
        </label>

        <div className={styles.importActions}>
          <Button aria-label="生成预览" htmlType="submit" loading={isPreviewing} type="primary">
            生成预览
          </Button>
          <Button
            aria-label="确认入库"
            disabled={!previewResult || pendingRows.length > 0}
            loading={isConfirming}
            onClick={handleConfirm}
            type="default"
          >
            确认入库
          </Button>
        </div>
      </form>

      <ImportPreviewTable preview={previewResult} />
      {previewResult ? (
        <PendingMatchTable
          rows={pendingRows}
          candidates={candidateMaterials}
          onResolve={handleResolvePendingRow}
        />
      ) : null}
    </div>
  );
}

function buildPendingMatchRows(
  preview: PreviewMasterDataImportResult | null,
): PendingMatchRowView[] {
  if (!preview) {
    return [];
  }

  return preview.rows
    .filter((row) => row.rowStatus === "pending" && row.id)
    .map((row) => ({
      id: row.id ?? "",
      rowNumber: row.rowNumber,
      sourceLabel: getPendingRowSourceLabel(row),
      reason: row.errors[0]?.message ?? "需要人工确认关联",
      candidateMaterialIds: "candidateMaterialIds" in row ? row.candidateMaterialIds : [],
    }));
}

function getPendingRowSourceLabel(row: PreviewMasterDataImportResult["rows"][number]): string {
  if ("paperName" in row.normalizedData) {
    return [row.normalizedData.supplierShortName, row.normalizedData.paperName]
      .filter(Boolean)
      .join(" / ");
  }

  return "rawLabel" in row.normalizedData ? row.normalizedData.rawLabel : `第 ${row.rowNumber} 行`;
}
