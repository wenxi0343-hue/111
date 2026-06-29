import { describe, expect, it, vi } from "vitest";

import packageJson from "../../../package.json";
import { runSeedDatabaseScript } from "../../../scripts/seed-database";
import { seedDatabase } from "@/db/seeds";

describe("database seed", () => {
  it("inserts the schema baseline metadata when missing", async () => {
    const insertSystemMetadata = vi.fn(async () => undefined);

    const result = await seedDatabase({
      repository: {
        findSystemMetadataByKey: async () => null,
        insertSystemMetadata,
        touchSystemMetadata: vi.fn(async () => undefined),
      },
    });

    expect(result).toEqual({ ok: true, message: "数据库初始化完成" });
    expect(insertSystemMetadata).toHaveBeenCalledWith({
      key: "schema_baseline",
      value: "created",
      description: "Database baseline metadata for migration and seed checks.",
    });
  });

  it("does not insert duplicate schema baseline metadata", async () => {
    const insertSystemMetadata = vi.fn(async () => undefined);
    const touchSystemMetadata = vi.fn(async () => undefined);

    const result = await seedDatabase({
      repository: {
        findSystemMetadataByKey: async () => ({ key: "schema_baseline" }),
        insertSystemMetadata,
        touchSystemMetadata,
      },
    });

    expect(result).toEqual({ ok: true, message: "数据库初始化完成" });
    expect(insertSystemMetadata).not.toHaveBeenCalled();
    expect(touchSystemMetadata).toHaveBeenCalledWith("schema_baseline");
  });

  it("returns a safe failure when the baseline table is unavailable", async () => {
    const result = await seedDatabase({
      repository: {
        findSystemMetadataByKey: async () => {
          throw new Error("relation system_metadata does not exist with secret-password");
        },
        insertSystemMetadata: vi.fn(async () => undefined),
        touchSystemMetadata: vi.fn(async () => undefined),
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("请先执行数据库迁移");
      expect(result.error.message).not.toContain("secret-password");
      expect(result.error.message).not.toContain("postgresql://");
    }
  });

  it("does not seed business default parameters in this feature", async () => {
    const insertedRecords: Array<{ key: string; value: string; description: string }> = [];

    await seedDatabase({
      repository: {
        findSystemMetadataByKey: async () => null,
        insertSystemMetadata: async (record) => {
          insertedRecords.push(record);
        },
        touchSystemMetadata: vi.fn(async () => undefined),
      },
    });

    expect(insertedRecords.map((record) => record.key)).toEqual(["schema_baseline"]);
    expect(JSON.stringify(insertedRecords)).not.toContain("瓦楞系数");
    expect(JSON.stringify(insertedRecords)).not.toContain("纸板厚度");
    expect(JSON.stringify(insertedRecords)).not.toContain("纸厂");
    expect(JSON.stringify(insertedRecords)).not.toContain("历史方案");
  });

  it("exposes the db:seed package script", () => {
    expect(packageJson.scripts["db:seed"]).toContain("scripts/seed-database.ts");
  });

  it("prints safe script output for seed success and failure", async () => {
    const successOutput: string[] = [];
    const successExitCode = await runSeedDatabaseScript({
      seed: async () => ({ ok: true, message: "数据库初始化完成" }),
      write: (message) => successOutput.push(message),
    });

    const failureOutput: string[] = [];
    const failureExitCode = await runSeedDatabaseScript({
      seed: async () => ({
        ok: false,
        error: {
          code: "DATABASE_SEED_FAILED",
          message: "数据库初始化失败，请先执行数据库迁移。",
        },
      }),
      write: (message) => failureOutput.push(message),
    });

    expect(successExitCode).toBe(0);
    expect(successOutput.join("\n")).toContain("数据库初始化完成");
    expect(failureExitCode).toBe(1);
    expect(failureOutput.join("\n")).toContain("请先执行数据库迁移");
    expect(failureOutput.join("\n")).not.toContain("secret-password");
    expect(failureOutput.join("\n")).not.toContain("postgresql://");
  });
});
