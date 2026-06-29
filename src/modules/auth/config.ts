import type { AuthConfigResult, AuthUser } from "./types";

import { AUTH_CONFIG_UNAVAILABLE_MESSAGE } from "./types";

interface RawAuthUser {
  username?: unknown;
  displayName?: unknown;
  passwordHash?: unknown;
}

const SCRYPT_HASH_PART_COUNT = 6;

function unavailable(): AuthConfigResult {
  return {
    ok: false,
    error: {
      code: "AUTH_CONFIG_UNAVAILABLE",
      message: AUTH_CONFIG_UNAVAILABLE_MESSAGE,
    },
  };
}

function isValidPasswordHash(passwordHash: string): boolean {
  const parts = passwordHash.split("$");

  return parts.length === SCRYPT_HASH_PART_COUNT && parts[0] === "scrypt";
}

function normalizeUser(rawUser: RawAuthUser): AuthUser | null {
  if (
    typeof rawUser.username !== "string" ||
    typeof rawUser.displayName !== "string" ||
    typeof rawUser.passwordHash !== "string"
  ) {
    return null;
  }

  const username = rawUser.username.trim();
  const displayName = rawUser.displayName.trim();
  const passwordHash = rawUser.passwordHash.trim();

  if (!username || !displayName || !isValidPasswordHash(passwordHash)) {
    return null;
  }

  return {
    username,
    displayName,
    passwordHash,
  };
}

export function loadAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfigResult {
  const sessionSecret = env.AUTH_SESSION_SECRET?.trim();
  const usersJson = env.AUTH_USERS_JSON?.trim();

  if (!sessionSecret || !usersJson) {
    return unavailable();
  }

  try {
    const parsedUsers: unknown = JSON.parse(usersJson);

    if (!Array.isArray(parsedUsers) || parsedUsers.length === 0) {
      return unavailable();
    }

    const users = parsedUsers
      .map((rawUser) => normalizeUser(rawUser as RawAuthUser))
      .filter((user): user is AuthUser => user !== null);

    if (users.length !== parsedUsers.length || users.length === 0) {
      return unavailable();
    }

    return {
      ok: true,
      data: {
        sessionSecret,
        users,
      },
    };
  } catch {
    return unavailable();
  }
}
