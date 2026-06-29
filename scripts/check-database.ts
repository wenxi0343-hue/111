import { pathToFileURL } from "node:url";

import { checkDatabaseConnection } from "../src/db/index.ts";

interface RunCheckDatabaseScriptOptions {
  check?: typeof checkDatabaseConnection;
  write?: (message: string) => void;
}

export async function runCheckDatabaseScript({
  check = checkDatabaseConnection,
  write = (message) => process.stdout.write(`${message}\n`),
}: RunCheckDatabaseScriptOptions = {}) {
  const result = await check();

  if (result.ok) {
    write(result.message);
    return 0;
  }

  write(result.error.message);
  return 1;
}

const scriptPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === scriptPath) {
  const exitCode = await runCheckDatabaseScript();
  process.exitCode = exitCode;
}
