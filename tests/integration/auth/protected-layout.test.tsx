// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HistoryProtectedLayout from "@/app/(main)/history/layout";
import { createSessionValue } from "@/modules/auth/session";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

const sessionSecret = "protected-layout-session-secret";
const passwordHash = "scrypt$1024$8$1$c2FsdA$aGFzaA";

function setValidAuthEnv() {
  process.env.AUTH_SESSION_SECRET = sessionSecret;
  process.env.AUTH_USERS_JSON = JSON.stringify([
    {
      username: "operator",
      displayName: "操作员",
      passwordHash,
    },
  ]);
}

function mockSessionCookie(value?: string) {
  mocks.cookies.mockResolvedValue({
    get: vi.fn(() => (value ? { value } : undefined)),
  });
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

describe("protected internal pages", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setValidAuthEnv();
    mockSessionCookie();
  });

  it("redirects unauthenticated history access to login with a return target", async () => {
    await expect(HistoryProtectedLayout({ children: <div>历史方案列表</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Fhistory",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=%2Fhistory");
    expect(screen.queryByText("历史方案列表")).toBeNull();
  });

  it("redirects expired sessions with a reason and return target", async () => {
    const expiredSession = createSession(new Date("2026-06-20T00:00:00.000Z"));
    mockSessionCookie(expiredSession.value);

    await expect(
      HistoryProtectedLayout({ children: <div>历史方案列表</div> }),
    ).rejects.toThrow("NEXT_REDIRECT:/login?reason=expired&next=%2Fhistory");

    expect(mocks.redirect).toHaveBeenCalledWith("/login?reason=expired&next=%2Fhistory");
  });

  it("renders protected content for a valid session", async () => {
    const validSession = createSession(new Date());
    mockSessionCookie(validSession.value);

    render(await HistoryProtectedLayout({ children: <div>历史方案列表</div> }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByText("历史方案列表")).toBeTruthy();
  });
});
