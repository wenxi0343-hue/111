import { describe, expect, it, vi } from "vitest";

import packageJson from "../../../package.json";
import {
  checkDatabaseConnection,
  closeDatabaseConnection,
  getDatabaseUrl,
} from "@/db";
import { runCheckDatabaseScript } from "../../../scripts/check-database";

describe("database connection check", () => {
  it("returns a safe error when DATABASE_URL is missing", () => {
    const result = getDatabaseUrl({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DATABASE_URL_MISSING");
      expect(result.error.message).toContain("需要先配置数据连接信息");
    }
  });

  it("returns a sanitized failure when the connection is unavailable", async () => {
    const result = await checkDatabaseConnection({
      databaseUrl: "postgresql://user:secret-password@localhost:5432/app",
      query: async () => {
        throw new Error("connect ECONNREFUSED with secret-password");
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("数据库连接不可用");
      expect(result.error.message).not.toContain("secret-password");
      expect(result.error.message).not.toContain("postgresql://");
      expect(result.error.details).toBeUndefined();
    }
  });

  it("returns success when the query executor succeeds", async () => {
    const result = await checkDatabaseConnection({
      databaseUrl: "postgresql://user:password@localhost:5432/app",
      query: async () => [{ "?column?": 1 }],
    });

    expect(result).toEqual({ ok: true, message: "数据库连接成功" });
  });

  it("closes the database pool only once", async () => {
    const pool = { end: vi.fn(async () => undefined) };
    const close = closeDatabaseConnection(pool);

    await close();
    await close();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("exposes the db:check package script", () => {
    expect(packageJson.scripts["db:check"]).toContain("scripts/check-database.ts");
  });

  it("prints a success message and exit code 0 for successful checks", async () => {
    const output: string[] = [];
    const exitCode = await runCheckDatabaseScript({
      check: async () => ({ ok: true, message: "数据库连接成功" }),
      write: (message) => output.push(message),
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("数据库连接成功");
  });

  it("prints a sanitized failure message and exit code 1 for failed checks", async () => {
    const output: string[] = [];
    const exitCode = await runCheckDatabaseScript({
      check: async () => ({
        ok: false,
        error: {
          code: "DATABASE_CONNECTION_FAILED",
          message: "数据库连接不可用，请检查地址、账号、密码或网络。",
        },
      }),
      write: (message) => output.push(message),
    });

    expect(exitCode).toBe(1);
    expect(output.join("\n")).toContain("数据库连接不可用");
    expect(output.join("\n")).not.toContain("secret-password");
    expect(output.join("\n")).not.toContain("postgresql://");
  });
});
