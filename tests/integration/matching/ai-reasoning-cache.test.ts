import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

const projectRoot = process.cwd();
const migrationsDir = join(projectRoot, "src", "db", "migrations");

function readAllMigrationSql(): string {
  if (!existsSync(migrationsDir)) {
    return "";
  }

  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n");
}

describe("ai reasoning cache schema", () => {
  it("exports AI reasoning cache and daily usage tables", () => {
    expect(getTableName(schema.aiReasoningCache)).toBe("ai_reasoning_cache");
    expect(getTableName(schema.aiReasoningDailyUsages)).toBe("ai_reasoning_daily_usages");
  });

  it("defines AI reason cache columns required by cached reason lookup", () => {
    const columns = getTableColumns(schema.aiReasoningCache);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "cacheKey",
        "reasonText",
        "factsSnapshot",
        "createdAt",
        "expiresAt",
      ]),
    );
    expect(columns.cacheKey.name).toBe("cache_key");
    expect(columns.reasonText.name).toBe("reason_text");
    expect(columns.factsSnapshot.name).toBe("facts_snapshot");
  });

  it("defines daily usage columns required by daily limit checks", () => {
    const columns = getTableColumns(schema.aiReasoningDailyUsages);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(["usageDate", "requestCount", "createdAt", "updatedAt"]),
    );
    expect(columns.usageDate.name).toBe("usage_date");
    expect(columns.requestCount.name).toBe("request_count");
  });

  it("keeps AI reasoning tables in migration SQL without embedding real secrets", () => {
    const migrationContent = readAllMigrationSql();

    expect(migrationContent).toContain('CREATE TABLE "ai_reasoning_cache"');
    expect(migrationContent).toContain('"cache_key" varchar(128) NOT NULL');
    expect(migrationContent).toContain('"reason_text" text NOT NULL');
    expect(migrationContent).toContain('"facts_snapshot" jsonb NOT NULL');
    expect(migrationContent).toContain('CREATE TABLE "ai_reasoning_daily_usages"');
    expect(migrationContent).toContain('"usage_date" varchar(10) NOT NULL');
    expect(migrationContent).toContain('"request_count" integer DEFAULT 0 NOT NULL');
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "ai_reasoning_cache_key_unique"');
    expect(migrationContent).toContain(
      'CREATE UNIQUE INDEX "ai_reasoning_daily_usages_date_unique"',
    );
    expect(migrationContent).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migrationContent).not.toMatch(/sk-[A-Za-z0-9_-]+/);
  });

  it("documents AI provider environment variables without real credentials", () => {
    const envExample = readFileSync(join(projectRoot, ".env.example"), "utf8");

    expect(envExample).toContain("AI_PROVIDER_API_KEY");
    expect(envExample).toContain("AI_PROVIDER_BASE_URL");
    expect(envExample).toContain("AI_REASONING_MODEL");
    expect(envExample).toContain("AI_REASONING_TIMEOUT_MS");
    expect(envExample).toContain("AI_REASONING_DAILY_LIMIT");
    expect(envExample).not.toMatch(/sk-[A-Za-z0-9_-]+/);
    expect(envExample).not.toContain("Bearer ");
  });
});
