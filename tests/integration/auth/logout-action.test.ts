import { describe, expect, it } from "vitest";

import { AUTH_SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { logout } from "@/server/actions/auth-actions";

function createCookieStore() {
  const deletedNames: string[] = [];

  return {
    deletedNames,
    store: {
      delete(name: string) {
        deletedNames.push(name);
      },
    },
  };
}

function expectSafeResult(result: unknown) {
  const serialized = JSON.stringify(result);

  expect(serialized).not.toContain("browser-session-secret");
  expect(serialized).not.toContain("AUTH_SESSION_SECRET");
  expect(serialized).not.toContain("stack");
}

describe("logout server action", () => {
  it("clears the session cookie and returns the login destination", async () => {
    const cookieStore = createCookieStore();

    const result = await logout({ cookieStore: cookieStore.store });

    expect(result).toEqual({
      ok: true,
      data: {
        redirectedTo: "/login",
      },
    });
    expect(cookieStore.deletedNames).toEqual([AUTH_SESSION_COOKIE_NAME]);
    expectSafeResult(result);
  });

  it("is safe to call when the visitor is already unauthenticated", async () => {
    const cookieStore = createCookieStore();

    await expect(logout({ cookieStore: cookieStore.store })).resolves.toEqual({
      ok: true,
      data: {
        redirectedTo: "/login",
      },
    });
    expect(cookieStore.deletedNames).toEqual([AUTH_SESSION_COOKIE_NAME]);
  });
});
