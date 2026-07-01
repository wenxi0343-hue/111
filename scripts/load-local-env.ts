import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOCAL_ENV_FILES = [".env.local", ".env"];

function parseEnvValue(rawValue: string): string {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replaceAll('\\"', '"')
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

export function loadLocalEnv(cwd = process.cwd()) {
  for (const envFile of LOCAL_ENV_FILES) {
    const envPath = resolve(cwd, envFile);

    if (!existsSync(envPath)) {
      continue;
    }

    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1);

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = parseEnvValue(rawValue);
    }
  }
}
