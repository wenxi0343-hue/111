import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loadAuthConfig } from "@/modules/auth/config";
import { AUTH_SESSION_COOKIE_NAME, verifySessionValue } from "@/modules/auth/session";
import type { ActionResult } from "@/shared/types/action-result";

interface AuthenticatedActionUser {
  username: string;
  displayName: string;
}

interface SessionCookieReader {
  get(name: string): { value: string } | undefined;
}

interface RequireAuthenticatedActionOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader;
  now?: Date;
}

interface RequireAuthenticatedPageOptions extends RequireAuthenticatedActionOptions {
  nextPath: string;
}

const AUTH_REQUIRED_RESULT = {
  ok: false,
  error: {
    code: "AUTH_REQUIRED",
    message: "需要先登录",
  },
} satisfies ActionResult<never>;

async function readSessionValue(cookieStore: SessionCookieReader | undefined): Promise<string | undefined> {
  if (cookieStore) {
    return cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  }

  const runtimeCookieStore = await cookies();

  return runtimeCookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
}

export async function requireAuthenticatedAction({
  env = process.env,
  cookieStore,
  now = new Date(),
}: RequireAuthenticatedActionOptions = {}): Promise<ActionResult<AuthenticatedActionUser>> {
  const configResult = loadAuthConfig(env);

  if (!configResult.ok) {
    return AUTH_REQUIRED_RESULT;
  }

  const sessionValue = await readSessionValue(cookieStore);
  const sessionResult = verifySessionValue({
    sessionValue,
    sessionSecret: configResult.data.sessionSecret,
    now,
  });

  if (!sessionResult.ok) {
    return sessionResult;
  }

  return {
    ok: true,
    data: {
      username: sessionResult.data.username,
      displayName: sessionResult.data.displayName,
    },
  };
}

export async function readAuthenticatedUser({
  env = process.env,
  cookieStore,
  now = new Date(),
}: RequireAuthenticatedActionOptions = {}): Promise<AuthenticatedActionUser | null> {
  const authOptions: RequireAuthenticatedActionOptions = { env, now };

  if (cookieStore) {
    authOptions.cookieStore = cookieStore;
  }

  const authResult = await requireAuthenticatedAction(authOptions);

  return authResult.ok ? authResult.data : null;
}

export async function requireAuthenticatedPage({
  env = process.env,
  cookieStore,
  now = new Date(),
  nextPath,
}: RequireAuthenticatedPageOptions): Promise<void> {
  const authOptions: RequireAuthenticatedActionOptions = { env, now };

  if (cookieStore) {
    authOptions.cookieStore = cookieStore;
  }

  const authResult = await requireAuthenticatedAction(authOptions);

  if (authResult.ok) {
    return;
  }

  const params = new URLSearchParams();

  if (authResult.error.code === "SESSION_EXPIRED") {
    params.set("reason", "expired");
  }

  params.set("next", nextPath);
  redirect(`/login?${params.toString()}`);
}
