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

describe("main app miniapp shell", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setValidAuthEnv();
    mockSessionCookie();
  });

  it("keeps the home page redirecting to the public matching page", () => {
    expect(() => HomePage()).toThrow("NEXT_REDIRECT:/matching");
    expect(mocks.redirect).toHaveBeenCalledWith("/matching");
  });

  it("renders the miniapp shell and matching content for unauthenticated visitors", async () => {
    render(await MainLayout({ children: <div>配纸页面内容</div> }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByText("纸箱自动配纸工具")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "底部模块导航" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "配纸" }).getAttribute("href")).toBe("/matching");
    expect(screen.getByRole("link", { name: "历史方案" }).getAttribute("href")).toBe("/history");
    expect(screen.queryByRole("link", { name: /数据管理/ })).toBeNull();
    expect(screen.getByText("未登录")).toBeTruthy();
    expect(screen.queryByText("需登录")).toBeNull();
    expect(screen.queryByRole("button", { name: "退出登录" })).toBeNull();
    expect(screen.getByText("配纸页面内容")).toBeTruthy();
  });

  it("keeps rendering the public shell for a tampered session", async () => {
    mockSessionCookie("tampered.session");

    render(await MainLayout({ children: <div>配纸页面内容</div> }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByText("未登录")).toBeTruthy();
    expect(screen.getByText("配纸页面内容")).toBeTruthy();
  });

  it("keeps rendering the public shell for an expired session", async () => {
    const expiredSession = createSession(new Date("2026-06-20T00:00:00.000Z"));
    mockSessionCookie(expiredSession.value);

    render(await MainLayout({ children: <div>配纸页面内容</div> }));

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(screen.getByText("未登录")).toBeTruthy();
    expect(screen.getByText("配纸页面内容")).toBeTruthy();
  });

  it("renders login status and logout control with a valid session", async () => {
    const validSession = createSession(new Date());
    mockSessionCookie(validSession.value);

    render(await MainLayout({ children: <div>历史方案内容</div> }));

    expect(screen.getByText("纸箱自动配纸工具")).toBeTruthy();
    expect(screen.getByText("已登录")).toBeTruthy();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy();
    expect(screen.getByText("历史方案内容")).toBeTruthy();
  });
});
