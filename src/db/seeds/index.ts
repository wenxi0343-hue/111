import { eq } from "drizzle-orm";

import { createDatabaseClient, getDatabaseUrl } from "../index.ts";
import { systemMetadata } from "../schema/index.ts";

export type SeedDatabaseResult =
  | { ok: true; message: "数据库初始化完成" }
  | {
      ok: false;
      error: {
        code: "DATABASE_SEED_FAILED";
        message: string;
      };
    };

interface SystemMetadataRecord {
  key: string;
  value: string;
  description: string;
}

interface SystemMetadataRepository {
  findSystemMetadataByKey: (key: string) => Promise<{ key: string } | null>;
  insertSystemMetadata: (record: SystemMetadataRecord) => Promise<void>;
  touchSystemMetadata: (key: string) => Promise<void>;
}

interface SeedDatabaseOptions {
  repository?: SystemMetadataRepository;
}

const schemaBaselineRecord = {
  key: "schema_baseline",
  value: "created",
  description: "Database baseline metadata for migration and seed checks.",
} satisfies SystemMetadataRecord;

export async function seedDatabase(options: SeedDatabaseOptions = {}): Promise<SeedDatabaseResult> {
  let close: (() => Promise<void>) | undefined;

  try {
    const repository = options.repository ?? (() => {
      const databaseUrlResult = getDatabaseUrl();

      if (!databaseUrlResult.ok) {
        throw new Error(databaseUrlResult.error.message);
      }

      const client = createDatabaseClient(databaseUrlResult.data);
      close = client.close;

      return createSystemMetadataRepository(client.db);
    })();

    const existingBaseline = await repository.findSystemMetadataByKey(schemaBaselineRecord.key);

    if (existingBaseline) {
      await repository.touchSystemMetadata(schemaBaselineRecord.key);
    } else {
      await repository.insertSystemMetadata(schemaBaselineRecord);
    }

    return { ok: true, message: "数据库初始化完成" };
  } catch {
    return {
      ok: false,
      error: {
        code: "DATABASE_SEED_FAILED",
        message: "数据库初始化失败，请先执行数据库迁移。",
      },
    };
  } finally {
    await close?.();
  }
}

function createSystemMetadataRepository(
  db: ReturnType<typeof createDatabaseClient>["db"],
): SystemMetadataRepository {
  return {
    async findSystemMetadataByKey(key) {
      const rows = await db
        .select({ key: systemMetadata.key })
        .from(systemMetadata)
        .where(eq(systemMetadata.key, key))
        .limit(1);

      return rows[0] ?? null;
    },
    async insertSystemMetadata(record) {
      await db.insert(systemMetadata).values(record);
    },
    async touchSystemMetadata(key) {
      await db
        .update(systemMetadata)
        .set({ updatedAt: new Date() })
        .where(eq(systemMetadata.key, key));
    },
  };
}
