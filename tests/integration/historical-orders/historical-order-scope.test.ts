import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { getTableName, isTable } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

const projectRoot = process.cwd();

describe("historical order feature scope", () => {
  it("does not add customer tables or customer relationship tables", () => {
    const tableNames = Object.values(schema)
      .filter((exportedValue) => isTable(exportedValue))
      .map((table) => getTableName(table));

    expect(tableNames).not.toEqual(
      expect.arrayContaining([
        "customers",
        "customer_profiles",
        "customer_preferences",
        "historical_order_customers",
      ]),
    );
  });

  it("keeps deterministic calculations independent from historical orders", () => {
    const calculationSource = readDirectoryText(join(projectRoot, "src", "modules", "calculations"));

    expect(calculationSource).not.toContain("historical-orders");
    expect(calculationSource).not.toContain("historicalOrder");
  });

  it("keeps recommendation historical habit ranking free of data access", () => {
    const recommendationSource = readDirectoryText(
      join(projectRoot, "src", "modules", "recommendation"),
    );

    expect(recommendationSource).toContain("historicalHabit");
    expect(recommendationSource).not.toContain("@/db");
    expect(recommendationSource).not.toContain("@/server");
    expect(recommendationSource).not.toContain("createDatabaseClient");
    expect(recommendationSource).not.toContain("drizzle(");
  });

  it("documents the historical-orders module boundary", () => {
    const readmePath = join(projectRoot, "src", "modules", "historical-orders", "README.md");

    expect(existsSync(readmePath)).toBe(true);

    const readme = readFileSync(readmePath, "utf8");

    expect(readme).toContain("订单清洗");
    expect(readme).toContain("习惯摘要");
    expect(readme).toContain("不覆盖计算");
    expect(readme).toContain("不参与推荐硬规则");
    expect(readme).toContain("不建立客户信息关联");
  });
});

function readDirectoryText(directory: string): string {
  if (!existsSync(directory)) {
    return "";
  }

  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .map((entryPath) => {
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        return readDirectoryText(entryPath);
      }

      if (!entryPath.endsWith(".ts") && !entryPath.endsWith(".tsx")) {
        return "";
      }

      return readFileSync(entryPath, "utf8");
    })
    .join("\n");
}
