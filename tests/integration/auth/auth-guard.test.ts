import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import { requireAuthenticatedAction } from "@/server/guards/auth";

const sessionSecret = "auth-guard-session-secret";
const passwordHash = "scrypt$1024$8$1$c2FsdA$aGFzaA";
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

function createCookieStore(sessionValue?: string) {
  return {
    get(name: string) {
      return name === "paper_box_auth_session" && sessionValue ? { value: sessionValue } : undefined;
    },
  };
}

function createSession(now: Date) {
  return createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now,
  });
}

function expectSafeFailure(result: unknown) {
  const serialized = JSON.stringify(result);

  expect(serialized).not.toContain("correct-password");
  expect(serialized).not.toContain(passwordHash);
  expect(serialized).not.toContain(sessionSecret);
  expect(serialized).not.toContain("AUTH_USERS_JSON");
  expect(serialized).not.toContain("原纸价格");
  expect(serialized).not.toContain("公式参数");
  expect(serialized).not.toContain("stack");
}

async function guardedBusinessAction({
  cookieStore,
  onExecute,
}: {
  cookieStore: ReturnType<typeof createCookieStore>;
  onExecute: () => void;
}) {
  const guardResult = await requireAuthenticatedAction({
    env: validEnv,
    cookieStore,
    now: new Date("2026-06-29T00:00:00.000Z"),
  });

  if (!guardResult.ok) {
    return guardResult;
  }

  onExecute();

  return {
    ok: true,
    data: {
      generated: true,
      by: guardResult.data.username,
    },
  };
}

describe("requireAuthenticatedAction", () => {
  it("returns AUTH_REQUIRED when no session cookie is present", async () => {
    const result = await requireAuthenticatedAction({
      env: validEnv,
      cookieStore: createCookieStore(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expectSafeFailure(result);
  });

  it("returns SESSION_EXPIRED when the session is expired", async () => {
    const expiredSession = createSession(new Date("2026-06-20T00:00:00.000Z"));

    const result = await requireAuthenticatedAction({
      env: validEnv,
      cookieStore: createCookieStore(expiredSession.value),
      now: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SESSION_EXPIRED",
        message: "登录状态已过期，请重新登录",
      },
    });
    expectSafeFailure(result);
  });

  it("treats an invalid signature as AUTH_REQUIRED without exposing signature details", async () => {
    const result = await requireAuthenticatedAction({
      env: validEnv,
      cookieStore: createCookieStore("tampered.session"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expectSafeFailure(result);
    expect(JSON.stringify(result)).not.toContain("signature");
  });

  it("returns the authenticated user when the session is valid", async () => {
    const validSession = createSession(new Date("2026-06-29T00:00:00.000Z"));

    const result = await requireAuthenticatedAction({
      env: validEnv,
      cookieStore: createCookieStore(validSession.value),
      now: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        username: "operator",
        displayName: "操作员",
      },
    });
  });

  it("keeps protected business logic from running when authentication fails", async () => {
    let executionCount = 0;

    const result = await guardedBusinessAction({
      cookieStore: createCookieStore(),
      onExecute: () => {
        executionCount += 1;
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(executionCount).toBe(0);
  });
});
