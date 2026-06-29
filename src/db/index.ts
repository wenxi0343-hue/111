import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.ts";

const { Pool } = pg;

export type DatabaseErrorCode = "DATABASE_URL_MISSING" | "DATABASE_CONNECTION_FAILED";

export type DatabaseResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: DatabaseErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
    };

export type DatabaseConnectionCheckResult =
  | { ok: true; message: "数据库连接成功" }
  | {
      ok: false;
      error: {
        code: DatabaseErrorCode;
        message: string;
        details?: Record<string, unknown>;
      };
    };

interface CheckDatabaseConnectionOptions {
  databaseUrl?: string;
  query?: () => Promise<unknown>;
}

export function getDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): DatabaseResult<string> {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return {
      ok: false,
      error: {
        code: "DATABASE_URL_MISSING",
        message: "DATABASE_URL 未配置，需要先配置数据连接信息。",
      },
    };
  }

  return { ok: true, data: databaseUrl };
}

export function createDatabaseClient(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    db: drizzle(pool, { schema }),
    pool,
    close: closeDatabaseConnection(pool),
  };
}

export function closeDatabaseConnection(pool: { end: () => Promise<void> }) {
  let hasClosed = false;

  return async () => {
    if (hasClosed) {
      return;
    }

    hasClosed = true;
    await pool.end();
  };
}

export async function checkDatabaseConnection(
  options: CheckDatabaseConnectionOptions = {},
): Promise<DatabaseConnectionCheckResult> {
  const databaseUrlResult =
    options.databaseUrl !== undefined
    ? getDatabaseUrl({ DATABASE_URL: options.databaseUrl })
    : getDatabaseUrl();

  if (!databaseUrlResult.ok) {
    return databaseUrlResult;
  }

  let close: (() => Promise<void>) | undefined;

  try {
    if (options.query) {
      await options.query();
      return { ok: true, message: "数据库连接成功" };
    }

    const client = createDatabaseClient(databaseUrlResult.data);
    close = client.close;
    await client.pool.query("SELECT 1");

    return { ok: true, message: "数据库连接成功" };
  } catch {
    return {
      ok: false,
      error: {
        code: "DATABASE_CONNECTION_FAILED",
        message: "数据库连接不可用，请检查地址、账号、密码或网络。",
      },
    };
  } finally {
    await close?.();
  }
}
