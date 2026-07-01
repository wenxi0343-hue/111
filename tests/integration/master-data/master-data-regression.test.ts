import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }

      return [fullPath];
    }),
  );

  return files.flat();
}

describe("master data regression boundaries", () => {
  it("does not depend on historical orders from master-data modules", async () => {
    const masterDataFiles = (await listFiles(path.join(process.cwd(), "src/modules/master-data")))
      .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));

    const contents = await Promise.all(
      masterDataFiles.map(async (file) => ({
        file,
        content: await readFile(file, "utf8"),
      })),
    );

    expect(contents.filter((item) => item.content.includes("historical-orders"))).toEqual([]);
  });

  it("keeps master data tests on desensitized local samples", async () => {
    const testFiles = (await listFiles(path.join(process.cwd(), "tests")))
      .filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.tsx"))
      .filter((file) => path.basename(file) !== "master-data-regression.test.ts");

    const contents = await Promise.all(
      testFiles.map(async (file) => ({
        file,
        content: await readFile(file, "utf8"),
      })),
    );

    expect(
      contents.filter(
        (item) =>
          item.content.includes("数据/") ||
          item.content.includes("近三年订单数据(2).xls") ||
          item.content.includes("原纸代码表2026年6.16更新.xlsx"),
      ),
    ).toEqual([]);
  });
});
