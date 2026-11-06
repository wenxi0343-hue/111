import { desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { matchingSchemes } from "@/db/schema";
import type * as schema from "@/db/schema";
import type { MatchingSchemeExportRecord } from "@/modules/import-export/matching-scheme-export-types";
import type { SelectionReason } from "@/modules/ai-reasoning/types";
import type { ActionResult } from "@/shared/types/action-result";

type AppDatabase = NodePgDatabase<typeof schema>;
type SnapshotObject = Record<string, unknown>;
type SnapshotArray = unknown[];
type SnapshotJson = SnapshotObject | SnapshotArray;

export const MATCHING_SCHEME_SAVE_FAILED_MESSAGE = "方案保存失败，请稍后重试";

const MATCHING_SCHEME_MISSING_ORIGINAL_MESSAGE = "缺少原始三套推荐结果，无法保存历史方案";
const MATCHING_SCHEME_HISTORY_LIMIT = 50;

export interface MatchingSchemeHistoryRecordInput {
  boxSpecSnapshot: SnapshotObject;
  originalRecommendationSlotsSnapshot: SnapshotArray;
  finalSchemeSnapshot: SnapshotObject;
  priceSnapshot: SnapshotJson;
  parameterVersion: string;
  isManuallyAdjusted: boolean;
  exportRecords: MatchingSchemeExportRecord[];
  confirmedBy: string;
  createdAt?: Date | undefined;
}

export interface MatchingSchemeHistoryRecord
  extends Omit<MatchingSchemeHistoryRecordInput, "createdAt"> {
  id: string;
  createdAt: Date;
}

export interface MatchingSchemeHistorySummary {
  id: string;
  createdAt: Date;
  finalStatus: string;
  isManuallyAdjusted: boolean;
  warningMessages: string[];
  selectionReason?: SelectionReason | undefined;
  exportRecords: MatchingSchemeExportRecord[];
}

export interface MatchingSchemeHistoryRepository {
  saveAndPruneLatest(
    input: MatchingSchemeHistoryRecordInput,
    limit: number,
  ): Promise<MatchingSchemeHistoryRecord>;
  listRecent(limit: number): Promise<MatchingSchemeHistoryRecord[]>;
  findById(id: string): Promise<MatchingSchemeHistoryRecord | null>;
  appendExportRecord(
    id: string,
    exportRecord: MatchingSchemeExportRecord,
  ): Promise<MatchingSchemeHistoryRecord | null>;
}

export async function saveMatchingSchemeHistory({
  repository,
  input,
  limit = MATCHING_SCHEME_HISTORY_LIMIT,
}: {
  repository: MatchingSchemeHistoryRepository;
  input: MatchingSchemeHistoryRecordInput;
  limit?: number | undefined;
}): Promise<ActionResult<MatchingSchemeHistoryRecord>> {
  if (input.originalRecommendationSlotsSnapshot.length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: MATCHING_SCHEME_MISSING_ORIGINAL_MESSAGE,
        details: {
          fieldErrors: [
            {
              field: "originalRecommendationSlotsSnapshot",
              message: MATCHING_SCHEME_MISSING_ORIGINAL_MESSAGE,
            },
          ],
        },
      },
    };
  }

  try {
    const savedRecord = await repository.saveAndPruneLatest(input, limit);

    return {
      ok: true,
      data: savedRecord,
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    };
  }
}

export async function listRecentMatchingSchemes({
  repository,
  limit = MATCHING_SCHEME_HISTORY_LIMIT,
}: {
  repository: MatchingSchemeHistoryRepository;
  limit?: number | undefined;
}): Promise<ActionResult<MatchingSchemeHistorySummary[]>> {
  try {
    const records = await repository.listRecent(clampHistoryLimit(limit));

    return {
      ok: true,
      data: records.map(toHistorySummary),
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    };
  }
}

export async function findMatchingSchemeHistoryById({
  repository,
  id,
}: {
  repository: MatchingSchemeHistoryRepository;
  id: string;
}): Promise<ActionResult<MatchingSchemeHistoryRecord | null>> {
  try {
    const record = await repository.findById(id);

    return {
      ok: true,
      data: record,
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    };
  }
}

export async function appendMatchingSchemeExportRecord({
  repository,
  schemeId,
  exportRecord,
}: {
  repository: MatchingSchemeHistoryRepository;
  schemeId: string;
  exportRecord: MatchingSchemeExportRecord;
}): Promise<ActionResult<MatchingSchemeHistoryRecord | null>> {
  try {
    const record = await repository.appendExportRecord(schemeId, exportRecord);

    return {
      ok: true,
      data: record,
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    };
  }
}

export async function listRecentMatchingSchemeHistory({
  repository,
  limit = MATCHING_SCHEME_HISTORY_LIMIT,
}: {
  repository: MatchingSchemeHistoryRepository;
  limit?: number | undefined;
}): Promise<ActionResult<MatchingSchemeHistoryRecord[]>> {
  try {
    const records = await repository.listRecent(limit);

    return {
      ok: true,
      data: records,
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    };
  }
}

export function createDrizzleMatchingSchemeHistoryRepository(
  db: AppDatabase,
): MatchingSchemeHistoryRepository {
  return new DrizzleMatchingSchemeHistoryRepository(db);
}

class DrizzleMatchingSchemeHistoryRepository implements MatchingSchemeHistoryRepository {
  constructor(private readonly db: AppDatabase) {}

  async saveAndPruneLatest(
    input: MatchingSchemeHistoryRecordInput,
    limit: number,
  ): Promise<MatchingSchemeHistoryRecord> {
    return this.db.transaction(async (tx) => {
      const [savedRecord] = await tx
        .insert(matchingSchemes)
        .values(toInsertValues(input))
        .returning();

      if (savedRecord === undefined) {
        throw new Error("matching scheme history insert returned no rows");
      }

      const oldRows = await tx
        .select({ id: matchingSchemes.id })
        .from(matchingSchemes)
        .orderBy(desc(matchingSchemes.createdAt), desc(matchingSchemes.id))
        .offset(limit);

      if (oldRows.length > 0) {
        await tx.delete(matchingSchemes).where(
          inArray(
            matchingSchemes.id,
            oldRows.map((row) => row.id),
          ),
        );
      }

      return toHistoryRecord(savedRecord);
    });
  }

  async listRecent(limit: number): Promise<MatchingSchemeHistoryRecord[]> {
    const rows = await this.db
      .select()
      .from(matchingSchemes)
      .orderBy(desc(matchingSchemes.createdAt), desc(matchingSchemes.id))
      .limit(limit);

    return rows.map(toHistoryRecord);
  }

  async findById(id: string): Promise<MatchingSchemeHistoryRecord | null> {
    const [row] = await this.db
      .select()
      .from(matchingSchemes)
      .where(eq(matchingSchemes.id, id))
      .limit(1);

    return row ? toHistoryRecord(row) : null;
  }

  async appendExportRecord(
    id: string,
    exportRecord: MatchingSchemeExportRecord,
  ): Promise<MatchingSchemeHistoryRecord | null> {
    return this.db.transaction(async (tx) => {
      const [currentRow] = await tx
        .select()
        .from(matchingSchemes)
        .where(eq(matchingSchemes.id, id))
        .limit(1);

      if (!currentRow) {
        return null;
      }

      const nextExportRecords = [...normalizeExportRecords(currentRow.exportRecords), exportRecord];
      const [updatedRow] = await tx
        .update(matchingSchemes)
        .set({ exportRecords: nextExportRecords })
        .where(eq(matchingSchemes.id, id))
        .returning();

      if (updatedRow === undefined) {
        throw new Error("matching scheme history update returned no rows");
      }

      return toHistoryRecord(updatedRow);
    });
  }


}

function toInsertValues(input: MatchingSchemeHistoryRecordInput) {
  return {
    boxSpecSnapshot: input.boxSpecSnapshot,
    originalRecommendationSlotsSnapshot: input.originalRecommendationSlotsSnapshot,
    finalSchemeSnapshot: input.finalSchemeSnapshot,
    priceSnapshot: input.priceSnapshot,
    parameterVersion: input.parameterVersion,
    isManuallyAdjusted: input.isManuallyAdjusted,
    exportRecords: input.exportRecords,
    confirmedBy: input.confirmedBy,
    ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
  };
}

function toHistoryRecord(row: typeof matchingSchemes.$inferSelect): MatchingSchemeHistoryRecord {
  return {
    id: row.id,
    boxSpecSnapshot: row.boxSpecSnapshot as SnapshotObject,
    originalRecommendationSlotsSnapshot: row.originalRecommendationSlotsSnapshot as SnapshotArray,
    finalSchemeSnapshot: row.finalSchemeSnapshot as SnapshotObject,
    priceSnapshot: row.priceSnapshot as SnapshotJson,
    parameterVersion: row.parameterVersion,
    isManuallyAdjusted: row.isManuallyAdjusted,
    exportRecords: normalizeExportRecords(row.exportRecords),
    confirmedBy: row.confirmedBy,
    createdAt: row.createdAt,
  };
}

function clampHistoryLimit(limit: number): number {
  return Math.min(Math.max(Math.trunc(limit), 1), MATCHING_SCHEME_HISTORY_LIMIT);
}

function toHistorySummary(record: MatchingSchemeHistoryRecord): MatchingSchemeHistorySummary {
  return {
    id: record.id,
    createdAt: record.createdAt,
    finalStatus: getStringSnapshotValue(record.finalSchemeSnapshot, "finalStatus", "unknown"),
    isManuallyAdjusted: record.isManuallyAdjusted,
    warningMessages: getStringArraySnapshotValue(record.finalSchemeSnapshot, "warningMessages"),
    ...(getSelectionReasonSnapshotValue(record.finalSchemeSnapshot) !== undefined
      ? { selectionReason: getSelectionReasonSnapshotValue(record.finalSchemeSnapshot) }
      : {}),
    exportRecords: record.exportRecords,
  };
}

function getSelectionReasonSnapshotValue(snapshot: SnapshotObject): SelectionReason | undefined {
  const value = snapshot.selectionReason;

  if (typeof value === "string" && value.trim().length > 0) {
    return {
      source: "template",
      sourceLabel: "模板生成",
      text: value.trim(),
      generatedAt: new Date(0).toISOString(),
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Partial<SelectionReason>;

  if (
    (candidate.source !== "ai" && candidate.source !== "template") ||
    (candidate.sourceLabel !== "AI 生成" && candidate.sourceLabel !== "模板生成") ||
    typeof candidate.text !== "string" ||
    candidate.text.trim().length === 0 ||
    typeof candidate.generatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    source: candidate.source,
    sourceLabel: candidate.sourceLabel,
    text: candidate.text,
    ...(candidate.fallbackReason !== undefined ? { fallbackReason: candidate.fallbackReason } : {}),
    generatedAt: candidate.generatedAt,
  };
}

function getStringSnapshotValue(
  snapshot: SnapshotObject,
  key: string,
  fallback: string,
): string {
  const value = snapshot[key];

  return typeof value === "string" ? value : fallback;
}

function getStringArraySnapshotValue(snapshot: SnapshotObject, key: string): string[] {
  const value = snapshot[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeExportRecords(value: unknown): MatchingSchemeExportRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is MatchingSchemeExportRecord => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Partial<MatchingSchemeExportRecord>;

    return (
      (candidate.type === "full_report" ||
        candidate.type === "summary_sheet" ||
        candidate.type === "scheme_excel") &&
      typeof candidate.exportedAt === "string"
    );
  });
}
