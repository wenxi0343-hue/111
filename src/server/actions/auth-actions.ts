"use server";

import { cookies } from "next/headers";

import { loadAuthConfig } from "@/modules/auth/config";
import { verifyPasswordHash } from "@/modules/auth/password";
import {
  AUTH_SESSION_COOKIE_NAME,
  createSessionValue,
  getSessionCookieOptions,
} from "@/modules/auth/session";
import type { ActionResult } from "@/shared/types/action-result";

interface LoginInput {
  username: string;
  password: string;
}

interface LoginResult {
  username: string;
  displayName: string;
}

interface LogoutResult {
  redirectedTo: "/login";
}

type SessionCookieOptions = ReturnType<typeof getSessionCookieOptions>;

interface SessionCookieWriter {
  set(name: string, value: string, options: SessionCookieOptions): void | Promise<void>;
}

interface SessionCookieDeleter {
  delete(name: string): void | Promise<void>;
}

interface LoginWithPasswordOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieWriter;
  isProduction?: boolean;
  now?: Date;
}

interface LogoutOptions {
  cookieStore?: SessionCookieDeleter;
}

const INVALID_CREDENTIALS_RESULT = {
  ok: false,
  error: {
    code: "INVALID_CREDENTIALS",
    message: "账号或密码错误",
  },
} satisfies ActionResult<never>;

const VALIDATION_ERROR_RESULT = {
  ok: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "请输入账号和密码",
  },
} satisfies ActionResult<never>;

async function writeSessionCookie({
  cookieStore,
  value,
  isProduction,
}: {
  cookieStore: SessionCookieWriter | undefined;
  value: string;
  isProduction: boolean;
}): Promise<void> {
  const options = getSessionCookieOptions({ isProduction });

  if (cookieStore) {
    await cookieStore.set(AUTH_SESSION_COOKIE_NAME, value, options);
    return;
  }

  const runtimeCookieStore = await cookies();
  runtimeCookieStore.set(AUTH_SESSION_COOKIE_NAME, value, options);
}

async function deleteSessionCookie(cookieStore: SessionCookieDeleter | undefined): Promise<void> {
  if (cookieStore) {
    await cookieStore.delete(AUTH_SESSION_COOKIE_NAME);
    return;
  }

  const runtimeCookieStore = await cookies();
  runtimeCookieStore.delete(AUTH_SESSION_COOKIE_NAME);
}

export async function loginWithPassword(
  input: LoginInput,
  {
    env = process.env,
    cookieStore,
    isProduction = process.env.NODE_ENV === "production",
    now = new Date(),
  }: LoginWithPasswordOptions = {},
): Promise<ActionResult<LoginResult>> {
  const username = input.username.trim();

  if (!username || !input.password) {
    return VALIDATION_ERROR_RESULT;
  }

  const configResult = loadAuthConfig(env);

  if (!configResult.ok) {
    return configResult;
  }

  const user = configResult.data.users.find((configuredUser) => configuredUser.username === username);

  if (!user) {
    return INVALID_CREDENTIALS_RESULT;
  }

  const isPasswordValid = await verifyPasswordHash(input.password, user.passwordHash);

  if (!isPasswordValid) {
    return INVALID_CREDENTIALS_RESULT;
  }

  const session = createSessionValue({
    user,
    sessionSecret: configResult.data.sessionSecret,
    now,
  });

  await writeSessionCookie({
    cookieStore,
    value: session.value,
    isProduction,
  });

  return {
    ok: true,
    data: {
      username: user.username,
      displayName: user.displayName,
    },
  };
}

export async function logout({
  cookieStore,
}: LogoutOptions = {}): Promise<ActionResult<LogoutResult>> {
  await deleteSessionCookie(cookieStore);

  return {
    ok: true,
    data: {
      redirectedTo: "/login",
    },
  };
}
