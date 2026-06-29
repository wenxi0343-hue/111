import { scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AUTH_SESSION_COOKIE_NAME, verifySessionValue } from "@/modules/auth/session";
import { loginWithPassword } from "@/server/actions/auth-actions";

interface CookieWrite {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    maxAge: number;
    path: string;
  };
}

function createTestHash(password: string, salt: string): string {
  const cost = 1024;
  const blockSize = 8;
  const parallelization = 1;
  const derivedKey = scryptSync(password, salt, 32, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });

  return [
    "scrypt",
    String(cost),
    String(blockSize),
    String(parallelization),
    Buffer.from(salt).toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

const passwordHash = createTestHash("correct-password", "login-action-salt");
const sessionSecret = "unit-test-session-secret";
const validEnv = {
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_USERS_JSON: JSON.stringify([
    {
      username: "operator",
      displayName: "操作员",
      passwordHash,
    },
  ]),
};

function createCookieStore() {
  const writes: CookieWrite[] = [];

  return {
    writes,
    store: {
      set(name: string, value: string, options: CookieWrite["options"]) {
        writes.push({ name, value, options });
      },
    },
  };
}

function expectSafeFailure(result: unknown) {
  const serialized = JSON.stringify(result);

  expect(serialized).not.toContain("correct-password");
  expect(serialized).not.toContain(passwordHash);
  expect(serialized).not.toContain(sessionSecret);
  expect(serialized).not.toContain("AUTH_USERS_JSON");
  expect(serialized).not.toContain("stack");
}

describe("login server action", () => {
  it("logs in with valid credentials and writes a signed session cookie", async () => {
    const cookieStore = createCookieStore();

    const result = await loginWithPassword(
      { username: "operator", password: "correct-password" },
      {
        env: validEnv,
        cookieStore: cookieStore.store,
        isProduction: false,
        now: new Date("2026-06-29T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        username: "operator",
        displayName: "操作员",
      },
    });
    expect(cookieStore.writes).toHaveLength(1);
    expect(cookieStore.writes[0]).toMatchObject({
      name: AUTH_SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 604800,
        path: "/",
      },
    });

    const sessionResult = verifySessionValue({
      sessionValue: cookieStore.writes[0]?.value,
      sessionSecret,
      now: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(sessionResult.ok).toBe(true);
  });

  it("rejects an existing username with the wrong password using a unified error", async () => {
    const cookieStore = createCookieStore();

    const result = await loginWithPassword(
      { username: "operator", password: "wrong-password" },
      { env: validEnv, cookieStore: cookieStore.store },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "账号或密码错误",
      },
    });
    expect(cookieStore.writes).toHaveLength(0);
    expectSafeFailure(result);
  });

  it("rejects a missing username with the same invalid credentials error", async () => {
    const result = await loginWithPassword(
      { username: "missing-user", password: "any-password" },
      { env: validEnv, cookieStore: createCookieStore().store },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "账号或密码错误",
      },
    });
    expectSafeFailure(result);
  });

  it("keeps the same error across three consecutive failed attempts", async () => {
    const attempts = await Promise.all([
      loginWithPassword(
        { username: "operator", password: "wrong-password" },
        { env: validEnv, cookieStore: createCookieStore().store },
      ),
      loginWithPassword(
        { username: "missing-user", password: "correct-password" },
        { env: validEnv, cookieStore: createCookieStore().store },
      ),
      loginWithPassword(
        { username: "operator", password: "another-wrong-password" },
        { env: validEnv, cookieStore: createCookieStore().store },
      ),
    ]);

    for (const result of attempts) {
      expect(result).toEqual({
        ok: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "账号或密码错误",
        },
      });
      expectSafeFailure(result);
    }
  });

  it("requires both username and password before checking credentials", async () => {
    const result = await loginWithPassword(
      { username: " ", password: "" },
      { env: validEnv, cookieStore: createCookieStore().store },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请输入账号和密码",
      },
    });
    expectSafeFailure(result);
  });

  it("returns a safe unavailable message when auth config is missing or invalid", async () => {
    const missingConfigResult = await loginWithPassword(
      { username: "operator", password: "correct-password" },
      { env: {}, cookieStore: createCookieStore().store },
    );
    const invalidConfigResult = await loginWithPassword(
      { username: "operator", password: "correct-password" },
      {
        env: {
          AUTH_SESSION_SECRET: sessionSecret,
          AUTH_USERS_JSON: "not-json",
        },
        cookieStore: createCookieStore().store,
      },
    );

    for (const result of [missingConfigResult, invalidConfigResult]) {
      expect(result).toEqual({
        ok: false,
        error: {
          code: "AUTH_CONFIG_UNAVAILABLE",
          message: "登录服务暂不可用，请联系系统维护人员",
        },
      });
      expectSafeFailure(result);
    }
  });
});
