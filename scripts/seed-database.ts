import { pathToFileURL } from "node:url";

import { seedDatabase } from "../src/db/seeds/index.ts";
import { loadLocalEnv } from "./load-local-env.ts";

loadLocalEnv();

interface RunSeedDatabaseScriptOptions {
  seed?: typeof seedDatabase;
  write?: (message: string) => void;
}

export async function runSeedDatabaseScript({
  seed = seedDatabase,
  write = (message) => process.stdout.write(`${message}\n`),
}: RunSeedDatabaseScriptOptions = {}) {
  const result = await seed();

  if (result.ok) {
    write(result.message);
    return 0;
  }

  write(result.error.message);
  return 1;
}

const scriptPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === scriptPath) {
  const exitCode = await runSeedDatabaseScript();
  process.exitCode = exitCode;
}
