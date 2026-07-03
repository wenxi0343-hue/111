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

describe("historical order schema", () => {
  it("exports the tables required by historical order imports and habit summaries", () => {
    expect(getTableName(schema.historicalOrderImportBatches)).toBe(
      "historical_order_import_batches",
    );
    expect(getTableName(schema.historicalOrderImportRows)).toBe("historical_order_import_rows");
    expect(getTableName(schema.historicalOrders)).toBe("historical_orders");
    expect(getTableName(schema.historicalOrderHabitSummaries)).toBe(
      "historical_order_habit_summaries",
    );
  });

  it("stores normalized historical order fields used for later statistics", () => {
    const columns = getTableColumns(schema.historicalOrders);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "orderDate",
        "productName",
        "lengthMm",
        "widthMm",
        "heightMm",
        "quantity",
        "rawPaperCode",
        "isStatistical",
      ]),
    );
    expect(columns.orderDate.name).toBe("order_date");
    expect(columns.productName.name).toBe("product_name");
    expect(columns.lengthMm.name).toBe("length_mm");
    expect(columns.widthMm.name).toBe("width_mm");
    expect(columns.heightMm.name).toBe("height_mm");
    expect(columns.rawPaperCode.name).toBe("raw_paper_code");
    expect(columns.isStatistical.name).toBe("is_statistical");
  });

  it("keeps import preview row raw data, normalized data, match result, and errors", () => {
    const columns = getTableColumns(schema.historicalOrderImportRows);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "rowStatus",
        "rawData",
        "normalizedData",
        "paperCodeMatchResult",
        "errors",
      ]),
    );
    expect(columns.rowStatus.name).toBe("row_status");
    expect(columns.rawData.name).toBe("raw_data");
    expect(columns.normalizedData.name).toBe("normalized_data");
    expect(columns.paperCodeMatchResult.name).toBe("paper_code_match_result");
  });

  it("creates historical-order structures without embedding real business data", () => {
    const migrationContent = readAllMigrationSql();

    expect(migrationContent).toContain('CREATE TABLE "historical_order_import_batches"');
    expect(migrationContent).toContain('CREATE TABLE "historical_order_import_rows"');
    expect(migrationContent).toContain('CREATE TABLE "historical_orders"');
    expect(migrationContent).toContain('CREATE TABLE "historical_order_habit_summaries"');
    expect(migrationContent).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migrationContent).not.toContain("近三年订单数据");
    expect(migrationContent).not.toContain("客户简称");
    expect(migrationContent).not.toContain("真实客户");
    expect(migrationContent).not.toContain("真实订单");
    expect(migrationContent).not.toContain("真实纸价");
  });
});
