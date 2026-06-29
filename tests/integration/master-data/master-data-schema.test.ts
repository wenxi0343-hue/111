import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";

const projectRoot = process.cwd();
const schemaDir = join(projectRoot, "src", "db", "schema");
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

describe("master data schema for iterative paper material updates", () => {
  it("exports the master data tables required by the import workflow", () => {
    expect(getTableName(schema.paperFactories)).toBe("paper_factories");
    expect(getTableName(schema.paperMaterials)).toBe("paper_materials");
    expect(getTableName(schema.paperMaterialPriceHistories)).toBe("paper_material_price_histories");
    expect(getTableName(schema.paperQualityStandards)).toBe("paper_quality_standards");
    expect(getTableName(schema.masterDataImportBatches)).toBe("master_data_import_batches");
    expect(getTableName(schema.masterDataImportRows)).toBe("master_data_import_rows");
    expect(getTableName(schema.paperMaterialMatchRules)).toBe("paper_material_match_rules");
    expect(getTableName(schema.masterDataChangeLogs)).toBe("master_data_change_logs");
  });

  it("keeps paper code globally unique while allowing repeated paper encoding", () => {
    const migrationContent = readAllMigrationSql();

    expect(migrationContent).toContain('CREATE UNIQUE INDEX "paper_materials_paper_code_unique"');
    expect(migrationContent).toContain('ON "paper_materials" USING btree ("paper_code")');
    expect(migrationContent).not.toContain('UNIQUE("paper_encoding")');
    expect(migrationContent).not.toContain("paper_materials_paper_encoding_unique");
  });

  it("defines completeness and active-state fields on paper materials", () => {
    const columns = getTableColumns(schema.paperMaterials);

    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining(["completenessStatus", "missingFields", "isActive"]),
    );
    expect(columns.completenessStatus.notNull).toBe(true);
    expect(columns.missingFields.notNull).toBe(true);
    expect(columns.isActive.notNull).toBe(true);
  });

  it("stores preview rows, pending candidates, match rules, and change logs", () => {
    const importRowColumns = getTableColumns(schema.masterDataImportRows);
    const matchRuleColumns = getTableColumns(schema.paperMaterialMatchRules);
    const changeLogColumns = getTableColumns(schema.masterDataChangeLogs);

    expect(Object.keys(importRowColumns)).toEqual(
      expect.arrayContaining([
        "batchId",
        "rowStatus",
        "rawData",
        "normalizedData",
        "candidateMaterialIds",
        "changeSet",
        "errors",
      ]),
    );
    expect(Object.keys(matchRuleColumns)).toEqual(
      expect.arrayContaining(["sourceSignature", "paperMaterialId", "confirmedBy"]),
    );
    expect(Object.keys(changeLogColumns)).toEqual(
      expect.arrayContaining(["entityType", "entityId", "changedFields", "reason"]),
    );
  });

  it("places schema files under src/db/schema without creating extra top-level modules", () => {
    expect(existsSync(join(schemaDir, "paper-factories.ts"))).toBe(true);
    expect(existsSync(join(schemaDir, "paper-materials.ts"))).toBe(true);
    expect(existsSync(join(schemaDir, "master-data-imports.ts"))).toBe(true);
  });

  it("creates only business table structures in migration files and no real business data", () => {
    const migrationContent = readAllMigrationSql();

    expect(migrationContent).toContain('CREATE TABLE "paper_factories"');
    expect(migrationContent).toContain('CREATE TABLE "paper_materials"');
    expect(migrationContent).toContain('CREATE TABLE "master_data_import_batches"');
    expect(migrationContent).toContain('CREATE TABLE "master_data_change_logs"');
    expect(migrationContent).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migrationContent).not.toContain("原纸代码表2026年6.16更新");
    expect(migrationContent).not.toContain("纸价(1)");
    expect(migrationContent).not.toContain("近三年订单数据");
    expect(migrationContent).not.toContain("客户简称");
    expect(migrationContent).not.toContain("订单规格");
  });
});
