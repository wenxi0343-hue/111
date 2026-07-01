"use client";

import { useState } from "react";

import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type { PaperMaterialListItem } from "@/modules/master-data/list-paper-materials";
import {
  getMasterDataChangeHistory,
  listPaperMaterials,
} from "@/server/actions/master-data-actions";

import { ChangeHistoryModal } from "./change-history-modal";
import { PaperMaterialList } from "./paper-material-list";

interface PaperMaterialListPanelProps {
  refreshToken?: number | undefined;
}

export function PaperMaterialListPanel({ refreshToken }: PaperMaterialListPanelProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyEntityName, setHistoryEntityName] = useState("");
  const [historyItems, setHistoryItems] = useState<MasterDataChangeLogRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | undefined>();

  async function handleViewHistory(item: PaperMaterialListItem) {
    setIsHistoryOpen(true);
    setHistoryEntityName(`${item.paperCode} ${item.name}`);
    setHistoryItems([]);
    setHistoryError(undefined);
    setIsHistoryLoading(true);

    try {
      const result = await getMasterDataChangeHistory({
        entityType: "paper_material",
        entityId: item.id,
      });

      if (!result.ok) {
        setHistoryError(result.error.message);
        return;
      }

      setHistoryItems(result.data.items);
    } finally {
      setIsHistoryLoading(false);
    }
  }

  return (
    <>
      <PaperMaterialList
        initialItems={[]}
        refreshToken={refreshToken}
        total={0}
        onFilterChange={async (query) => {
          const result = await listPaperMaterials({ ...query, page: 1, pageSize: 20 });

          if (!result.ok) {
            throw new Error(result.error.message);
          }

          return result.data;
        }}
        onViewHistory={(item) => void handleViewHistory(item)}
      />
      <ChangeHistoryModal
        entityName={historyEntityName}
        errorMessage={historyError}
        isLoading={isHistoryLoading}
        isOpen={isHistoryOpen}
        items={historyItems}
        onClose={() => setIsHistoryOpen(false)}
      />
    </>
  );
}
