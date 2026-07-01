"use client";

import { useState } from "react";

import { Button } from "antd";

import styles from "../master-data.module.css";

export interface PendingMatchRowView {
  id: string;
  rowNumber: number;
  sourceLabel: string;
  reason: string;
  candidateMaterialIds: string[];
}

export interface PendingMatchCandidateView {
  id: string;
  paperCode: string;
  name: string;
  factoryName?: string | undefined;
  gramWeightGsm: number;
}

interface PendingMatchTableProps {
  rows: PendingMatchRowView[];
  candidates: PendingMatchCandidateView[];
  onResolve: (input: { rowId: string; paperMaterialId: string }) => Promise<void>;
}

export function PendingMatchTable({ rows, candidates, onResolve }: PendingMatchTableProps) {
  const [selectedByRowId, setSelectedByRowId] = useState<Record<string, string>>({});
  const [resolvingRowId, setResolvingRowId] = useState<string | null>(null);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  async function handleResolve(row: PendingMatchRowView) {
    const selectedMaterialId = selectedByRowId[row.id] ?? row.candidateMaterialIds[0];

    if (!selectedMaterialId) {
      return;
    }

    setResolvingRowId(row.id);

    try {
      await onResolve({
        rowId: row.id,
        paperMaterialId: selectedMaterialId,
      });
    } finally {
      setResolvingRowId(null);
    }
  }

  return (
    <section className={styles.previewGroup} aria-label="待确认关联">
      <h3>待确认关联</h3>
      {rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th>行号</th>
                <th>来源记录</th>
                <th>原因</th>
                <th>候选原纸</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selectedMaterialId = selectedByRowId[row.id] ?? row.candidateMaterialIds[0] ?? "";

                return (
                  <tr key={row.id}>
                    <td>{row.rowNumber}</td>
                    <td>{row.sourceLabel}</td>
                    <td>{row.reason}</td>
                    <td>
                      <select
                        aria-label={`第 ${row.rowNumber} 行选择候选原纸`}
                        value={selectedMaterialId}
                        onChange={(event) =>
                          setSelectedByRowId((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))
                        }
                      >
                        {row.candidateMaterialIds.map((candidateId) => {
                          const candidate = candidatesById.get(candidateId);

                          return (
                            <option key={candidateId} value={candidateId}>
                              {candidate ? formatCandidate(candidate) : candidateId}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td>
                      <Button
                        aria-label={`确认第 ${row.rowNumber} 行关联`}
                        disabled={!selectedMaterialId}
                        loading={resolvingRowId === row.id}
                        onClick={() => void handleResolve(row)}
                        type="primary"
                      >
                        确认关联
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.groupEmpty}>暂无待确认记录</p>
      )}
    </section>
  );
}

function formatCandidate(candidate: PendingMatchCandidateView): string {
  return [
    candidate.paperCode,
    candidate.factoryName ?? "-",
    candidate.name,
    `${candidate.gramWeightGsm}g`,
  ].join(" | ");
}
