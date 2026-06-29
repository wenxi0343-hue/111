"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

import { Alert, Button } from "antd";

import {
  confirmMasterDataImport,
  previewMasterDataImport,
  type PreviewMasterDataImportResult,
} from "@/server/actions/master-data-actions";

import { ImportPreviewTable } from "./import-preview-table";
import styles from "../master-data.module.css";

const PAPER_CODE_SOURCE_TYPE = "paper_code_table";

export function ImportUploadPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewMasterDataImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  async function handlePreviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!selectedFile) {
      setErrorMessage("请先选择原纸代码表文件");
      return;
    }

    const formData = new FormData();
    formData.set("sourceType", PAPER_CODE_SOURCE_TYPE);
    formData.set("file", selectedFile);
    setIsPreviewing(true);

    try {
      const result = await previewMasterDataImport(formData);

      if (!result.ok) {
        setErrorMessage(result.error.message);
        return;
      }

      setPreviewResult(result.data);
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

      setSuccessMessage(
        `入库完成：新增 ${result.data.createdMaterialCount} 张原纸，更新 ${result.data.updatedMaterialCount} 张原纸，跳过 ${result.data.skippedFailedRowCount} 行。`,
      );
    } finally {
      setIsConfirming(false);
    }
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
            value={PAPER_CODE_SOURCE_TYPE}
            disabled
          >
            <option value={PAPER_CODE_SOURCE_TYPE}>原纸代码表</option>
          </select>
        </label>

        <label className={styles.importField} htmlFor="paper-code-workbook">
          <span>选择原纸代码表</span>
          <input
            id="paper-code-workbook"
            name="file"
            type="file"
            accept=".xlsx"
            aria-label="选择原纸代码表"
            onChange={handleFileChange}
          />
        </label>

        <div className={styles.importActions}>
          <Button aria-label="生成预览" htmlType="submit" loading={isPreviewing} type="primary">
            生成预览
          </Button>
          <Button
            aria-label="确认入库"
            disabled={!previewResult}
            loading={isConfirming}
            onClick={handleConfirm}
            type="default"
          >
            确认入库
          </Button>
        </div>
      </form>

      <ImportPreviewTable preview={previewResult} />
    </div>
  );
}
