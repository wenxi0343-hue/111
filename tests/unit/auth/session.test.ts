import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_COOKIE_NAME,
  createSessionValue,
  getSessionCookieOptions,
  verifySessionValue,
} from "@/modules/auth/session";

const sessionSecret = "unit-test-session-secret";
const now = new Date("2026-06-29T00:00:00.000Z");
const user = {
  username: "operator",
  displayName: "操作员",
};

describe("auth session", () => {
  it("creates a session that expires seven days after login", () => {
    const session = createSessionValue({
      user,
      sessionSecret,
      now,
    });

    expect(session.expiresAt.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  it("verifies a fresh session with the same secret", () => {
    const session = createSessionValue({
      user,
      sessionSecret,
      now,
    });

    const result = verifySessionValue({
      sessionValue: session.value,
      sessionSecret,
      now: new Date("2026-06-30T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      data: {
        username: "operator",
        displayName: "操作员",
        issuedAt: "2026-06-29T00:00:00.000Z",
        expiresAt: "2026-07-06T00:00:00.000Z",
      },
    });
  });

  it("rejects a tampered session without leaking signature details", () => {
    const session = createSessionValue({
      user,
      sessionSecret,
      now,
    });
    const tamperedValue = `${session.value.slice(0, -1)}x`;

    const result = verifySessionValue({
      sessionValue: tamperedValue,
      sessionSecret,
      now: new Date("2026-06-30T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(JSON.stringify(result)).not.toContain(sessionSecret);
  });

  it("keeps a session valid before the expiration time", () => {
    const session = createSessionValue({
      user,
      sessionSecret,
      now,
    });

    const result = verifySessionValue({
      sessionValue: session.value,
      sessionSecret,
      now: new Date("2026-07-05T23:59:59.000Z"),
    });

    expect(result.ok).toBe(true);
  });

  it("marks a session as expired after seven days", () => {
    const session = createSessionValue({
      user,
      sessionSecret,
      now,
    });

    const result = verifySessionValue({
      sessionValue: session.value,
      sessionSecret,
      now: new Date("2026-07-06T00:00:01.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SESSION_EXPIRED",
        message: "登录状态已过期，请重新登录",
      },
    });
  });

  it("uses secure HttpOnly cookie defaults for the session", () => {
    const options = getSessionCookieOptions({ isProduction: false });

    expect(AUTH_SESSION_COOKIE_NAME).toBe("paper_box_auth_session");
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 604800,
      path: "/",
    });
  });

  it("uses secure cookies in production", () => {
    const options = getSessionCookieOptions({ isProduction: true });

    expect(options.secure).toBe(true);
  });
});
