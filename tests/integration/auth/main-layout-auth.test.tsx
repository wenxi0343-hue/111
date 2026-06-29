// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import MainLayout from "@/app/(main)/layout";
import { createSessionValue } from "@/modules/auth/session";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  cookies: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

const sessionSecret = "main-layout-session-secret";
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

describe("main app access protection", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setValidAuthEnv();
    mockSessionCookie();
  });

  it("keeps the home page redirecting to dashboard", () => {
    expect(() => HomePage()).toThrow("NEXT_REDIRECT:/dashboard");
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects an unauthenticated visitor to login before rendering app navigation", async () => {
    await expect(async () => MainLayout({ children: <div>工作台内容</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("工作台")).toBeNull();
  });

  it("redirects a tampered session to login", async () => {
    mockSessionCookie("tampered.session");

    await expect(async () => MainLayout({ children: <div>工作台内容</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects an expired session to login with an expired reason", async () => {
    const expiredSession = createSession(new Date("2026-06-20T00:00:00.000Z"));
    mockSessionCookie(expiredSession.value);

    await expect(async () => MainLayout({ children: <div>工作台内容</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login?reason=expired",
    );

    expect(mocks.redirect).toHaveBeenCalledWith("/login?reason=expired");
  });

  it("renders the main layout and child content with a valid session", async () => {
    const validSession = createSession(new Date());
    mockSessionCookie(validSession.value);

    render(await MainLayout({ children: <div>工作台内容</div> }));

    expect(screen.getByText("纸箱自动配纸工具")).toBeTruthy();
    expect(screen.getByText("工作台")).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(screen.getByText("工作台内容")).toBeTruthy();
  });
});
