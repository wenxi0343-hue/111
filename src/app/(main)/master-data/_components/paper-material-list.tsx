"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ListPaperMaterialsQuery,
  ListPaperMaterialsResult,
  PaperMaterialListItem,
} from "@/modules/master-data/list-paper-materials";

import styles from "../master-data.module.css";

interface PaperMaterialListProps {
  initialItems: PaperMaterialListItem[];
  refreshToken?: number | undefined;
  total: number;
  onFilterChange: (query: ListPaperMaterialsQuery) => Promise<ListPaperMaterialsResult>;
  onViewHistory?: (item: PaperMaterialListItem) => void;
}

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

const paperKindLabels: Record<string, string> = {
  corrugating: "瓦纸",
  linerboard: "箱板纸",
  unknown: "未分类",
};

export function PaperMaterialList({
  initialItems,
  refreshToken,
  total,
  onFilterChange,
  onViewHistory,
}: PaperMaterialListProps) {
  const [items, setItems] = useState(initialItems);
  const [itemTotal, setItemTotal] = useState(total);
  const [isLoading, setIsLoading] = useState(false);
  const currentQueryRef = useRef<ListPaperMaterialsQuery>({});

  useEffect(() => {
    if (refreshToken === undefined) {
      return;
    }

    let isCancelled = false;

    async function refreshMaterials() {
      setIsLoading(true);

      try {
        const result = await onFilterChange({ ...currentQueryRef.current, page: 1, pageSize: 20 });

        if (!isCancelled) {
          setItems(result.items);
          setItemTotal(result.total);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void refreshMaterials();

    return () => {
      isCancelled = true;
    };
  }, [refreshToken, onFilterChange]);

  async function handleCompletenessChange(value: string) {
    const query: ListPaperMaterialsQuery =
      value === "all" ? {} : { completenessStatus: value as "complete" | "incomplete" };

    currentQueryRef.current = query;
    setIsLoading(true);

    try {
      const result = await onFilterChange(query);

      setItems(result.items);
      setItemTotal(result.total);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-label="原纸资料库" className={styles.listRegion}>
      <div className={styles.previewHeading}>
        <h2>原纸资料库</h2>
        <p>共 {itemTotal} 张原纸，资料完整后才可进入正式推荐。</p>
      </div>

      <div className={styles.listToolbar}>
        <label className={styles.importField} htmlFor="paper-material-completeness">
          <span>资料完整性</span>
          <select
            id="paper-material-completeness"
            aria-label="资料完整性"
            onChange={(event) => void handleCompletenessChange(event.target.value)}
          >
            <option value="all">全部</option>
            <option value="complete">完整</option>
            <option value="incomplete">资料不完整</option>
          </select>
        </label>
        {isLoading ? <span className={styles.loadingText}>加载中</span> : null}
      </div>

      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th>原纸代码</th>
                <th>原纸名称</th>
                <th>纸厂</th>
                <th>纸类</th>
                <th>克重</th>
                <th>当前价格</th>
                <th>完整性</th>
                <th>启用状态</th>
                <th>缺失资料</th>
                {onViewHistory ? <th>操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.paperCode}</td>
                  <td>{item.name}</td>
                  <td>{item.factoryName}</td>
                  <td>{paperKindLabels[item.paperKind] ?? item.paperKind}</td>
                  <td>{item.gramWeightGsm}g</td>
                  <td>{formatPrice(item.priceYuanPerTon)}</td>
                  <td>{item.completenessStatus === "complete" ? "完整" : "资料不完整"}</td>
                  <td>{item.isActive ? "启用" : "停用"}</td>
                  <td>{formatMissingFields(item.missingFields)}</td>
                  {onViewHistory ? (
                    <td>
                      <button type="button" onClick={() => onViewHistory(item)}>
                        查看历史
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.groupEmpty}>暂无原纸资料</p>
      )}
    </section>
  );
}

function formatPrice(priceYuanPerTon: number | undefined): string {
  return priceYuanPerTon === undefined ? "-" : `${priceYuanPerTon} 元/吨`;
}

function formatMissingFields(missingFields: string[]): string {
  if (missingFields.length === 0) {
    return "-";
  }

  return `缺少${missingFields.map((field) => missingFieldLabels[field] ?? field).join("、")}`;
}
