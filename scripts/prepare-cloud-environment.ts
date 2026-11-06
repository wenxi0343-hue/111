import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import pg from "pg";

// One-time provisioning: refuses to rotate an existing role or overwrite secrets.
const role = "paper_matching_cloud";
const outputPath = resolve("tmp/deployment/paper-matching.env");
// Use Next's loader so escaped dollar signs in password hashes are decoded
// exactly as they are by the application, before emitting a systemd env file.
const requireFromNext = createRequire(import.meta.resolve("next"));
const { loadEnvConfig } = requireFromNext("@next/env") as {
  loadEnvConfig: (directory: string) => unknown;
};
loadEnvConfig(process.cwd());

async function prepare() {
  if (existsSync(outputPath)) {
    throw new Error("Cloud environment already exists; reuse the existing file.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !process.env.AUTH_USERS_JSON) {
    throw new Error("Local database and login configuration are required.");
  }
  const authUsers = JSON.parse(process.env.AUTH_USERS_JSON) as Array<{
    username?: string;
    displayName?: string;
    passwordHash?: string;
  }>;
  if (!Array.isArray(authUsers) || !authUsers.length || authUsers.some((user) =>
    !user.username || !user.displayName || user.passwordHash?.split("$").length !== 6
  )) {
    throw new Error("Local login configuration is not valid.");
  }
  const sourceUrl = new URL(databaseUrl);
  if (sourceUrl.pathname !== "/paper_warehouse") {
    throw new Error("Expected the existing paper_warehouse database.");
  }
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const existingRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
    if (existingRole.rowCount) {
      throw new Error("Cloud database role already exists; no credentials were changed.");
    }
    const password = randomBytes(32).toString("hex");
    await client.query("BEGIN");
    try {
      await client.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 12`);
      await client.query(`GRANT CONNECT ON DATABASE paper_warehouse TO ${role}`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
      await client.query(`GRANT SELECT ON public.paper_paperroll, public.system_metadata TO ${role}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.matching_schemes, public.ai_reasoning_cache, public.ai_reasoning_daily_usages TO ${role}`);

      const cloudUrl = new URL(databaseUrl);
      cloudUrl.username = role;
      cloudUrl.password = password;
      cloudUrl.hostname = "127.0.0.1";
      cloudUrl.port = "15432";
      const values: Record<string, string> = {
        DATABASE_URL: cloudUrl.toString(),
        AUTH_SESSION_SECRET: randomBytes(32).toString("hex"),
        AUTH_USERS_JSON: process.env.AUTH_USERS_JSON,
        MATCHING_GENERATION_TOKEN_SECRET: randomBytes(32).toString("hex"),
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        PLAYWRIGHT_BROWSERS_PATH: "/var/lib/paper-matching/browsers",
      };
      for (const key of ["AI_PROVIDER_API_KEY", "AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_FORMAT", "AI_REASONING_MODEL", "AI_REASONING_TIMEOUT_MS", "AI_REASONING_DAILY_LIMIT"]) {
        const value = process.env[key];
        if (value) values[key] = value;
      }
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
      await client.query("COMMIT");
      console.warn(JSON.stringify({ role, database: "paper_warehouse", outputPath, warehouseAccess: "SELECT only" }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

prepare().catch(() => {
  console.error("Cloud environment preparation failed. Credentials were not printed; inspect the role and output-file state before retrying.");
  process.exitCode = 1;
});
