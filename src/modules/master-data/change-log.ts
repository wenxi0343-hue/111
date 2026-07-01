import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { masterDataChangeLogs } from "@/db/schema";
import type * as schema from "@/db/schema";
import type {
  MasterDataChangeLogRecord,
  MasterDataChangeSource,
  MasterDataEntityType,
} from "@/modules/master-data/import-commit";

type AppDatabase = NodePgDatabase<typeof schema>;

export interface GetMasterDataChangeHistoryInput {
  entityType: MasterDataEntityType;
  entityId: string;
}

export interface GetMasterDataChangeHistoryResult {
  items: MasterDataChangeLogRecord[];
}

export interface MasterDataChangeLogRepository {
  listChangeLogs(input: {
    entityType: MasterDataEntityType;
    entityId: string;
  }): Promise<MasterDataChangeLogRecord[]>;
}

export async function getMasterDataChangeHistoryFromRepository({
  repository,
  input,
}: {
  repository: MasterDataChangeLogRepository;
  input: GetMasterDataChangeHistoryInput;
}): Promise<GetMasterDataChangeHistoryResult> {
  const items = await repository.listChangeLogs(input);

  return {
    items: [...items].sort(compareChangeLogsByCreatedAtDesc),
  };
}

export function createDrizzleMasterDataChangeLogRepository(
  db: AppDatabase,
): MasterDataChangeLogRepository {
  return new DrizzleMasterDataChangeLogRepository(db);
}

function compareChangeLogsByCreatedAtDesc(
  left: MasterDataChangeLogRecord,
  right: MasterDataChangeLogRecord,
): number {
  return getCreatedAtTime(right) - getCreatedAtTime(left);
}

function getCreatedAtTime(log: MasterDataChangeLogRecord): number {
  return log.createdAt?.getTime() ?? 0;
}

class DrizzleMasterDataChangeLogRepository implements MasterDataChangeLogRepository {
  constructor(private readonly db: AppDatabase) {}

  async listChangeLogs(input: {
    entityType: MasterDataEntityType;
    entityId: string;
  }): Promise<MasterDataChangeLogRecord[]> {
    const rows = await this.db
      .select()
      .from(masterDataChangeLogs)
      .where(
        and(
          eq(masterDataChangeLogs.entityType, input.entityType),
          eq(masterDataChangeLogs.entityId, input.entityId),
        ),
      )
      .orderBy(desc(masterDataChangeLogs.createdAt));

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType as MasterDataEntityType,
      entityId: row.entityId,
      changeSource: row.changeSource as MasterDataChangeSource,
      importBatchId: row.importBatchId ?? undefined,
      changedFields: row.changedFields as MasterDataChangeLogRecord["changedFields"],
      reason: row.reason ?? undefined,
      changedBy: row.changedBy,
      createdAt: row.createdAt,
    }));
  }
}
