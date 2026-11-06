import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import {
  MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
  appendMatchingSchemeExportRecord,
  findMatchingSchemeHistoryById,
  listRecentMatchingSchemes,
  saveMatchingSchemeHistory,
  type MatchingSchemeHistoryRecord,
  type MatchingSchemeHistoryRecordInput,
  type MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";
import type { MatchingSchemeExportRecord } from "@/modules/import-export/matching-scheme-pdf-types";

const migrationsDir = join(process.cwd(), "src", "db", "migrations");

function readAllMigrationSql(): string {
  if (!existsSync(migrationsDir)) {
    return "";
  }

  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n");
}

class InMemoryMatchingSchemeHistoryRepository implements MatchingSchemeHistoryRepository {
  records: MatchingSchemeHistoryRecord[] = [];

  async saveAndPruneLatest(input: MatchingSchemeHistoryRecordInput, limit: number) {
    const record: MatchingSchemeHistoryRecord = {
      id: `history-${this.records.length + 1}`,
      ...input,
      createdAt: input.createdAt ?? new Date("2026-07-02T00:00:00.000Z"),
    };

    this.records = [record, ...this.records]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);

    return record;
  }

  async listRecent(limit: number) {
    return this.records
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async findById(id: string) {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async appendExportRecord(id: string, exportRecord: MatchingSchemeExportRecord) {
    const record = await this.findById(id);

    if (!record) {
      return null;
    }

    const updatedRecord = {
      ...record,
      exportRecords: [...record.exportRecords, exportRecord],
    };

    this.records = this.records.map((item) => (item.id === id ? updatedRecord : item));

    return updatedRecord;
  }


}

function createHistoryInput(
  overrides: Partial<MatchingSchemeHistoryRecordInput> = {},
): MatchingSchemeHistoryRecordInput {
  return {
    boxSpecSnapshot: {
      lengthMm: 500,
      widthMm: 300,
      heightMm: 250,
      productionQuantity: 1000,
    },
    originalRecommendationSlotsSnapshot: [
      { slot: "economy", status: "qualified", costYuan: 2.1 },
      { slot: "safety", status: "qualified", costYuan: 2.4 },
      { slot: "balanced", status: "qualified", costYuan: 2.3 },
    ],
    finalSchemeSnapshot: {
      slot: "economy",
      finalStatus: "qualified",
      productionQuantity: 1000,
    },
    priceSnapshot: {
      currency: "CNY",
      taxIncludedCostYuan: 2.1,
    },
    parameterVersion: "default-2026-07",
    isManuallyAdjusted: false,
    exportRecords: [],
    confirmedBy: "operator",
    createdAt: new Date("2026-07-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("matching scheme history schema", () => {
  it("exports the matching_schemes table required by confirmed history", () => {
    expect(schema.matchingSchemes).toBeDefined();
    expect(getTableName(schema.matchingSchemes)).toBe("matching_schemes");
  });

  it("defines snapshots, status flags, export records and created time", () => {
    const columns = getTableColumns(schema.matchingSchemes);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "boxSpecSnapshot",
        "originalRecommendationSlotsSnapshot",
        "finalSchemeSnapshot",
        "priceSnapshot",
        "parameterVersion",
        "isManuallyAdjusted",
        "exportRecords",
        "createdAt",
      ]),
    );
    expect(columns.boxSpecSnapshot.notNull).toBe(true);
    expect(columns.originalRecommendationSlotsSnapshot.notNull).toBe(true);
    expect(columns.finalSchemeSnapshot.notNull).toBe(true);
    expect(columns.priceSnapshot.notNull).toBe(true);
    expect(columns.parameterVersion.notNull).toBe(true);
    expect(columns.isManuallyAdjusted.notNull).toBe(true);
    expect(columns.exportRecords.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
  });

  it("keeps matching_schemes creation in migration sql", () => {
    const migrationContent = readAllMigrationSql();

    expect(migrationContent).toContain('CREATE TABLE "matching_schemes"');
    expect(migrationContent).toContain('"box_spec_snapshot" jsonb NOT NULL');
    expect(migrationContent).toContain(
      '"original_recommendation_slots_snapshot" jsonb DEFAULT \'[]\'::jsonb NOT NULL',
    );
    expect(migrationContent).toContain('"final_scheme_snapshot" jsonb NOT NULL');
    expect(migrationContent).toContain('"price_snapshot" jsonb NOT NULL');
    expect(migrationContent).toContain('"parameter_version" varchar(80) NOT NULL');
    expect(migrationContent).toContain('"is_manually_adjusted" boolean DEFAULT false NOT NULL');
    expect(migrationContent).toContain('"export_records" jsonb DEFAULT \'[]\'::jsonb NOT NULL');
    expect(migrationContent).toContain('"created_at" timestamp with time zone DEFAULT now() NOT NULL');
  });
});

describe("matching scheme history save", () => {
  it("saves and reads back the confirmed final scheme", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();
    const input = createHistoryInput();

    const result = await saveMatchingSchemeHistory({ repository, input });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history save should succeed");
    }

    const [saved] = await repository.listRecent(50);
    expect(saved).toMatchObject({
      boxSpecSnapshot: expect.objectContaining({ productionQuantity: 1000 }),
      finalSchemeSnapshot: expect.objectContaining({ finalStatus: "qualified" }),
      originalRecommendationSlotsSnapshot: input.originalRecommendationSlotsSnapshot,
    });
  });

  it("finds a full saved history snapshot by id", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    await saveMatchingSchemeHistory({
      repository,
      input: createHistoryInput({
        boxSpecSnapshot: {
          lengthMm: 600,
          widthMm: 400,
          heightMm: 300,
          productionQuantity: 2000,
        },
      }),
    });

    const result = await findMatchingSchemeHistoryById({
      repository,
      id: "history-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history find should succeed");
    }

    expect(result.data).toMatchObject({
      id: "history-1",
      boxSpecSnapshot: expect.objectContaining({ productionQuantity: 2000 }),
      originalRecommendationSlotsSnapshot: expect.arrayContaining([
        expect.objectContaining({ slot: "economy" }),
      ]),
      finalSchemeSnapshot: expect.objectContaining({ finalStatus: "qualified" }),
      exportRecords: [],
    });
  });

  it("returns null when a history id does not exist", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    const result = await findMatchingSchemeHistoryById({
      repository,
      id: "missing-history",
    });

    expect(result).toEqual({
      ok: true,
      data: null,
    });
  });

  it("appends export records in order and keeps them readable", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    await saveMatchingSchemeHistory({
      repository,
      input: createHistoryInput(),
    });

    const fullReport = await appendMatchingSchemeExportRecord({
      repository,
      schemeId: "history-1",
      exportRecord: {
        type: "full_report",
        exportedAt: "2026-07-02T10:30:00.000Z",
      },
    });
    const summarySheet = await appendMatchingSchemeExportRecord({
      repository,
      schemeId: "history-1",
      exportRecord: {
        type: "summary_sheet",
        exportedAt: "2026-07-02T10:35:00.000Z",
      },
    });

    expect(fullReport.ok).toBe(true);
    expect(summarySheet.ok).toBe(true);

    const saved = await repository.findById("history-1");
    expect(saved?.exportRecords).toEqual([
      { type: "full_report", exportedAt: "2026-07-02T10:30:00.000Z" },
      { type: "summary_sheet", exportedAt: "2026-07-02T10:35:00.000Z" },
    ]);
  });

  it("rejects a save without original recommendation slots", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    const result = await saveMatchingSchemeHistory({
      repository,
      input: createHistoryInput({ originalRecommendationSlotsSnapshot: [] }),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "缺少原始三套推荐结果，无法保存历史方案",
        details: {
          fieldErrors: [
            {
              field: "originalRecommendationSlotsSnapshot",
              message: "缺少原始三套推荐结果，无法保存历史方案",
            },
          ],
        },
      },
    });
    expect(repository.records).toHaveLength(0);
  });

  it("keeps only the latest 50 saved history records", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    for (let index = 0; index < 51; index += 1) {
      const result = await saveMatchingSchemeHistory({
        repository,
        input: createHistoryInput({
          createdAt: new Date(Date.UTC(2026, 6, 2, 0, index)),
          finalSchemeSnapshot: {
            slot: "economy",
            finalStatus: "qualified",
            sequence: index,
          },
        }),
      });

      expect(result.ok).toBe(true);
    }

    const recent = await repository.listRecent(100);
    expect(recent).toHaveLength(50);
    expect(recent[0]?.finalSchemeSnapshot).toMatchObject({ sequence: 50 });
    expect(recent.at(-1)?.finalSchemeSnapshot).toMatchObject({ sequence: 1 });
    expect(JSON.stringify(recent)).not.toContain('"sequence":0');
  });

  it("lists at most 50 recent history summaries in descending save time", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository();

    for (let index = 0; index < 51; index += 1) {
      await saveMatchingSchemeHistory({
        repository,
        input: createHistoryInput({
          isManuallyAdjusted: index === 50,
          createdAt: new Date(Date.UTC(2026, 6, 2, 0, index)),
          finalSchemeSnapshot: {
            finalStatus: index === 50 ? "not_manufacturable" : "qualified",
            warningMessages: index === 50 ? ["最终方案不可生产，不建议生产"] : [],
          },
        }),
      });
    }

    const result = await listRecentMatchingSchemes({ repository, limit: 100 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history list should succeed");
    }

    expect(result.data).toHaveLength(50);
    expect(result.data[0]).toMatchObject({
      finalStatus: "not_manufacturable",
      isManuallyAdjusted: true,
      warningMessages: ["最终方案不可生产，不建议生产"],
      exportRecords: [],
    });
    expect(result.data[0]?.createdAt.getTime()).toBeGreaterThan(
      result.data.at(-1)?.createdAt.getTime() ?? 0,
    );
  });

  it("returns a safe save failure without leaking database details", async () => {
    const repository: MatchingSchemeHistoryRepository = {
      saveAndPruneLatest: vi.fn(async () => {
        throw new Error("SQL connection failed postgresql://secret-password\nstack trace");
      }),
      listRecent: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      appendExportRecord: vi.fn(async () => null),
    };

    const result = await saveMatchingSchemeHistory({
      repository,
      input: createHistoryInput(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    });
    expect(JSON.stringify(result)).not.toContain("postgresql://");
    expect(JSON.stringify(result)).not.toContain("secret-password");
    expect(JSON.stringify(result)).not.toContain("stack trace");
  });

  it("returns a safe append failure without leaking database details", async () => {
    const repository: MatchingSchemeHistoryRepository = {
      saveAndPruneLatest: vi.fn(async (input) => ({
        id: "history-1",
        ...input,
        createdAt: input.createdAt ?? new Date("2026-07-02T00:00:00.000Z"),
      })),
      listRecent: vi.fn(async () => []),
      findById: vi.fn(async () => null),
      appendExportRecord: vi.fn(async () => {
        throw new Error("SQL connection failed postgresql://secret-password\nstack trace");
      }),
    };

    const result = await appendMatchingSchemeExportRecord({
      repository,
      schemeId: "history-1",
      exportRecord: {
        type: "full_report",
        exportedAt: "2026-07-02T10:30:00.000Z",
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: MATCHING_SCHEME_SAVE_FAILED_MESSAGE,
      },
    });
    expect(JSON.stringify(result)).not.toContain("postgresql://");
    expect(JSON.stringify(result)).not.toContain("secret-password");
    expect(JSON.stringify(result)).not.toContain("stack trace");
  });
});
