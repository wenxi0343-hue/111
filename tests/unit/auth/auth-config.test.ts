import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAuthConfig } from "@/modules/auth/config";

const unavailableMessage = "登录服务暂不可用，请联系系统维护人员";

describe("auth config", () => {
  it("loads fixed users without exposing plaintext password fields", () => {
    const result = loadAuthConfig({
      AUTH_SESSION_SECRET: "unit-test-session-secret",
      AUTH_USERS_JSON: JSON.stringify([
        {
          username: "operator",
          displayName: "操作员",
          passwordHash: "scrypt$16384$8$1$c2FsdA$IrrelevantHash",
          password: "must-not-leak",
          role: "admin",
          tenant: "factory-a",
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected auth config to load");
    }

    expect(result.data.sessionSecret).toBe("unit-test-session-secret");
    expect(result.data.users).toEqual([
      {
        username: "operator",
        displayName: "操作员",
        passwordHash: "scrypt$16384$8$1$c2FsdA$IrrelevantHash",
      },
    ]);
    expect(JSON.stringify(result.data.users)).not.toContain("must-not-leak");
    expect(JSON.stringify(result.data.users)).not.toContain("role");
    expect(JSON.stringify(result.data.users)).not.toContain("tenant");
  });

  it.each([
    ["missing users", { AUTH_SESSION_SECRET: "secret" }],
    ["empty users", { AUTH_SESSION_SECRET: "secret", AUTH_USERS_JSON: "[]" }],
    ["invalid json", { AUTH_SESSION_SECRET: "secret", AUTH_USERS_JSON: "not-json" }],
    [
      "missing password hash",
      {
        AUTH_SESSION_SECRET: "secret",
        AUTH_USERS_JSON: JSON.stringify([{ username: "operator", displayName: "操作员" }]),
      },
    ],
    [
      "missing session secret",
      {
        AUTH_USERS_JSON: JSON.stringify([
          {
            username: "operator",
            displayName: "操作员",
            passwordHash: "scrypt$16384$8$1$c2FsdA$IrrelevantHash",
          },
        ]),
      },
    ],
  ])("returns a safe error when config is invalid: %s", (_caseName, env) => {
    const result = loadAuthConfig(env);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_CONFIG_UNAVAILABLE",
        message: unavailableMessage,
      },
    });
  });

  it("documents auth env vars without plaintext secrets", () => {
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(envExample).toContain("AUTH_SESSION_SECRET");
    expect(envExample).toContain("AUTH_USERS_JSON");
    expect(envExample).toContain("passwordHash");
    expect(envExample).not.toContain("AUTH_PASSWORD=");
    expect(envExample).not.toContain("plainPassword");
    expect(envExample).not.toContain("demo-password");
  });
});
