import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("database setup documentation", () => {
  it("documents the recommended database command order", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    const dbCheckIndex = readme.indexOf("pnpm db:check");
    const dbGenerateIndex = readme.indexOf("pnpm db:generate");
    const dbMigrateIndex = readme.indexOf("pnpm db:migrate");
    const dbSeedIndex = readme.indexOf("pnpm db:seed");

    expect(dbCheckIndex).toBeGreaterThanOrEqual(0);
    expect(dbGenerateIndex).toBeGreaterThan(dbCheckIndex);
    expect(dbMigrateIndex).toBeGreaterThan(dbGenerateIndex);
    expect(dbSeedIndex).toBeGreaterThan(dbMigrateIndex);
  });
});
