"use client";

import { useState, type FormEvent } from "react";

import type {
  UpdatePaperMaterialInput,
  UpdatePaperMaterialResult,
} from "@/modules/master-data/update-paper-material";
import type { ActionResult } from "@/shared/types/action-result";

import styles from "../master-data.module.css";

export interface PaperMaterialEditFormMaterial {
  id: string;
  paperCode: string;
  paperEncoding?: string | undefined;
  name: string;
  priceYuanPerTon?: number | undefined;
  burstIndex?: number | undefined;
  ringCrushIndex?: number | undefined;
}

export interface PaperMaterialEditFormProps {
  material: PaperMaterialEditFormMaterial;
  onSubmit: (
    input: UpdatePaperMaterialInput,
  ) => Promise<ActionResult<UpdatePaperMaterialResult>>;
  onSaved?: (result: UpdatePaperMaterialResult) => void;
}

export function PaperMaterialEditForm({
  material,
  onSubmit,
  onSaved,
}: PaperMaterialEditFormProps) {
  const [paperCode, setPaperCode] = useState(material.paperCode);
  const [paperEncoding, setPaperEncoding] = useState(material.paperEncoding ?? "");
  const [name, setName] = useState(material.name);
  const [priceYuanPerTon, setPriceYuanPerTon] = useState(formatNumber(material.priceYuanPerTon));
  const [burstIndex, setBurstIndex] = useState(formatNumber(material.burstIndex));
  const [ringCrushIndex, setRingCrushIndex] = useState(formatNumber(material.ringCrushIndex));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    setIsSaving(true);

    try {
      const result = await onSubmit({
        paperMaterialId: material.id,
        patch: {
          paperCode,
          paperEncoding,
          name,
          priceYuanPerTon: parseOptionalNumber(priceYuanPerTon),
          burstIndex: parseOptionalNumber(burstIndex),
          ringCrushIndex: parseOptionalNumber(ringCrushIndex),
        },
        reason,
      });

      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }

      setMessage("保存成功");
      onSaved?.(result.data);
    } catch {
      setMessage("保存失败，请稍后重试");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.editForm} aria-label="编辑原纸资料" onSubmit={handleSubmit}>
      <div className={styles.editFormGrid}>
        <label className={styles.importField}>
          <span>原纸代码</span>
          <input value={paperCode} onChange={(event) => setPaperCode(event.target.value)} />
        </label>
        <label className={styles.importField}>
          <span>原纸编码</span>
          <input
            value={paperEncoding}
            onChange={(event) => setPaperEncoding(event.target.value)}
          />
        </label>
        <label className={styles.importField}>
          <span>原纸名称</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className={styles.importField}>
          <span>当前纸价</span>
          <input
            inputMode="decimal"
            value={priceYuanPerTon}
            onChange={(event) => setPriceYuanPerTon(event.target.value)}
          />
        </label>
        <label className={styles.importField}>
          <span>耐破指数</span>
          <input
            inputMode="decimal"
            value={burstIndex}
            onChange={(event) => setBurstIndex(event.target.value)}
          />
        </label>
        <label className={styles.importField}>
          <span>横向环压指数</span>
          <input
            inputMode="decimal"
            value={ringCrushIndex}
            onChange={(event) => setRingCrushIndex(event.target.value)}
          />
        </label>
        <label className={styles.importField}>
          <span>修改原因</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>

      {message ? <p className={styles.formMessage}>{message}</p> : null}

      <div className={styles.importActions}>
        <button type="submit" disabled={isSaving}>
          {isSaving ? "保存中" : "保存"}
        </button>
      </div>
    </form>
  );
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const numericValue = Number(trimmedValue);

  return Number.isFinite(numericValue) ? numericValue : undefined;
}
