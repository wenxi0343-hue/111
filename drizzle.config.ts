import { defineConfig } from "drizzle-kit";

export function createDrizzleConfig(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置，请先配置数据连接信息。");
  }

  return defineConfig({
    schema: "./src/db/schema",
    out: "./src/db/migrations",
    dialect: "postgresql",
    dbCredentials: {
      url: databaseUrl,
    },
  });
}

const isVitest = process.env.VITEST === "true";

export default process.env.DATABASE_URL
  ? createDrizzleConfig(process.env.DATABASE_URL)
  : isVitest
    ? defineConfig({
      schema: "./src/db/schema",
      out: "./src/db/migrations",
      dialect: "postgresql",
      dbCredentials: {
        url: "postgresql://missing-database-url.invalid",
      },
    })
    : createDrizzleConfig(undefined);
