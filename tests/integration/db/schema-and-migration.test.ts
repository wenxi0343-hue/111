import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDrizzleConfig } from "../../../drizzle.config";
import * as schema from "@/db/schema";

const projectRoot = process.cwd();
const migrationsDir = join(projectRoot, "src", "db", "migrations");

describe("database schema and baseline migration", () => {
  it("exports the system metadata table used by baseline seed data", () => {
    expect(schema.systemMetadata).toBeDefined();
    expect(getTableName(schema.systemMetadata)).toBe("system_metadata");
  });

  it("defines system metadata columns required by the baseline seed", () => {
    const columns = getTableColumns(schema.systemMetadata);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(["id", "key", "value", "description", "createdAt", "updatedAt"]),
    );
    expect(columns.key.notNull).toBe(true);
    expect(columns.value.notNull).toBe(true);
  });

  it("does not silently use an empty database url in drizzle config", () => {
    expect(() => createDrizzleConfig(undefined)).toThrow("DATABASE_URL 未配置");
    expect(() => createDrizzleConfig("")).toThrow("DATABASE_URL 未配置");
  });

  it("keeps the baseline system migration in the database migrations directory", () => {
    expect(existsSync(migrationsDir)).toBe(true);

    const migrationFiles = readdirSync(migrationsDir).filter((fileName) =>
      fileName.endsWith(".sql"),
    );
    const migrationContent = migrationFiles
      .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
      .join("\n");

    expect(migrationContent).toContain('CREATE TABLE "system_metadata"');
    expect(migrationContent).toContain('"key" varchar(100) NOT NULL');
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "system_metadata_key_unique"');
  });
});
