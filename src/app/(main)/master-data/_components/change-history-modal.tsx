"use client";

import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";

import styles from "../master-data.module.css";

interface ChangeHistoryModalProps {
  isOpen: boolean;
  entityName: string;
  items: MasterDataChangeLogRecord[];
  isLoading?: boolean;
  errorMessage?: string | undefined;
  onClose: () => void;
}

const fieldLabels: Record<string, string> = {
  paper_code: "原纸代码",
  paperCode: "原纸代码",
  paper_encoding: "原纸编码",
  paperEncoding: "原纸编码",
  name: "原纸名称",
  paper_kind: "纸类",
  paperKind: "纸类",
  grade: "等级",
  gram_weight_gsm: "克重",
  gramWeightGsm: "克重",
  usage: "用途",
  applicable_flutes: "适用瓦型",
  applicableFlutes: "适用瓦型",
  price_yuan_per_ton: "当前纸价",
  priceYuanPerTon: "当前纸价",
  burst_index: "耐破指数",
  burstIndex: "耐破指数",
  ring_crush_index: "横向环压指数",
  ringCrushIndex: "横向环压指数",
  is_active: "启用状态",
  isActive: "启用状态",
};

const sourceLabels: Record<MasterDataChangeLogRecord["changeSource"], string> = {
  import: "导入",
  manual: "手工修改",
};

export function ChangeHistoryModal({
  isOpen,
  entityName,
  items,
  isLoading = false,
  errorMessage,
  onClose,
}: ChangeHistoryModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop}>
      <section
        aria-label="修改历史"
        aria-modal="true"
        className={styles.modal}
        role="dialog"
      >
        <div className={styles.modalHeader}>
          <div>
            <h2>修改历史</h2>
            <p>{entityName}</p>
          </div>
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        {isLoading ? <p className={styles.loadingText}>加载中</p> : null}
        {errorMessage ? <p className={styles.formMessage}>{errorMessage}</p> : null}

        {!isLoading && !errorMessage && items.length === 0 ? (
          <p className={styles.groupEmpty}>暂无修改历史</p>
        ) : null}

        {!isLoading && !errorMessage && items.length > 0 ? (
          <div className={styles.historyList}>
            {items.map((item) => (
              <article className={styles.historyItem} key={item.id}>
                <dl className={styles.historyMeta}>
                  <div>
                    <dt>来源</dt>
                    <dd>{sourceLabels[item.changeSource] ?? item.changeSource}</dd>
                  </div>
                  <div>
                    <dt>修改人</dt>
                    <dd>{item.changedBy}</dd>
                  </div>
                  <div>
                    <dt>修改时间</dt>
                    <dd>{formatDate(item.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>原因</dt>
                    <dd>{item.reason ?? "-"}</dd>
                  </div>
                </dl>

                <table className={styles.historyTable}>
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>旧值</th>
                      <th>新值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(item.changedFields).map(([field, change]) => (
                      <tr key={field}>
                        <td>{fieldLabels[field] ?? field}</td>
                        <td>{formatValue(change.before)}</td>
                        <td>{formatValue(change.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (Array.isArray(value)) {
    return value.join("、");
  }

  if (typeof value === "boolean") {
    return value ? "启用" : "停用";
  }

  return String(value);
}

function formatDate(value: Date | string | undefined): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = date.getUTCFullYear();
  const month = padNumber(date.getUTCMonth() + 1);
  const day = padNumber(date.getUTCDate());
  const hour = padNumber(date.getUTCHours());
  const minute = padNumber(date.getUTCMinutes());

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}
