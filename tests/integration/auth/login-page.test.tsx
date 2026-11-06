// @vitest-environment jsdom
import { scryptSync } from "node:crypto";

import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import { loginWithPassword } from "@/server/actions/auth-actions";
import LoginPage from "@/app/(auth)/login/page";
import { LoginForm } from "@/app/(auth)/login/_components/login-form";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
  cookies: vi.fn(),
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

vi.mock("@/server/actions/auth-actions", () => ({
  loginWithPassword: vi.fn(),
}));

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

function renderLoginForm(nextPath?: string) {
  return render(<LoginForm {...(nextPath ? { nextPath } : {})} />);
}

function queryForbiddenEntries() {
  return ["注册", "找回密码", "验证码", "账号管理"].map((text) => screen.queryByText(text));
}

const mockedLoginWithPassword = vi.mocked(loginWithPassword);
const sessionSecret = "login-page-session-secret";
const passwordHash = createTestHash("correct-password", "login-page-salt");

describe("login page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
    process.env.AUTH_SESSION_SECRET = sessionSecret;
    process.env.AUTH_USERS_JSON = JSON.stringify([
      {
        username: "operator",
        displayName: "操作员",
        passwordHash,
      },
    ]);
  });

  it("renders username, password and login controls without extra account entry points", () => {
    renderLoginForm();

    expect(screen.getByLabelText("账号")).toBeTruthy();
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(queryForbiddenEntries()).toEqual([null, null, null, null]);
  });

  it("shows a validation message when username or password is empty", async () => {
    renderLoginForm();

    fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));

    expect(await screen.findByText("请输入账号和密码")).toBeTruthy();
    expect(mockedLoginWithPassword).not.toHaveBeenCalled();
  });

  it("shows an expired session message from the login page reason", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ reason: "expired" }),
      }),
    );

    expect(screen.getByText("登录状态已过期，请重新登录")).toBeTruthy();
  });

  it("shows a unified message when credentials are invalid", async () => {
    mockedLoginWithPassword.mockResolvedValue({
      ok: false,
      error: {
        code: "INVALID_CREDENTIALS",
        message: "账号或密码错误",
      },
    });
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong-password" } });
    fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));

    expect(await screen.findByText("账号或密码错误")).toBeTruthy();
    expect(mockedLoginWithPassword).toHaveBeenCalledWith({
      username: "operator",
      password: "wrong-password",
    });
  });

  it("shows a safe unavailable message when auth config is unavailable", async () => {
    mockedLoginWithPassword.mockResolvedValue({
      ok: false,
      error: {
        code: "AUTH_CONFIG_UNAVAILABLE",
        message: "登录服务暂不可用，请联系系统维护人员",
      },
    });
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct-password" } });
    fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));

    const message = await screen.findByText("登录服务暂不可用，请联系系统维护人员");
    const pageText = document.body.textContent ?? "";

    expect(message).toBeTruthy();
    expect(pageText).not.toContain("correct-password");
    expect(pageText).not.toContain(passwordHash);
    expect(pageText).not.toContain(sessionSecret);
    expect(pageText).not.toContain("stack");
    expect(pageText).not.toContain("原纸价格");
    expect(pageText).not.toContain("公式参数");
  });

  it("moves to history after successful login", async () => {
    mockedLoginWithPassword.mockResolvedValue({
      ok: true,
      data: {
        username: "operator",
        displayName: "操作员",
      },
    });
    renderLoginForm();

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct-password" } });
    fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/history");
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it("returns to the requested internal page after successful login", async () => {
    mockedLoginWithPassword.mockResolvedValue({
      ok: true,
      data: {
        username: "operator",
        displayName: "操作员",
      },
    });
    renderLoginForm("/history");

    fireEvent.change(screen.getByLabelText("账号"), { target: { value: "operator" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct-password" } });
    fireEvent.submit(screen.getByRole("form", { name: "登录表单" }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/history");
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it("redirects an already logged-in user to the requested protected page", async () => {
    const session = createSessionValue({
      user: {
        username: "operator",
        displayName: "操作员",
      },
      sessionSecret,
      now: new Date(),
    });
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: session.value })),
    });

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/history" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/history");
    expect(mocks.redirect).toHaveBeenCalledWith("/history");
  });
});
