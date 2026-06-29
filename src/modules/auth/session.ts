import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE_NAME = "paper_box_auth_session";

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

interface SessionUser {
  username: string;
  displayName: string;
}

interface CreateSessionValueInput {
  user: SessionUser;
  sessionSecret: string;
  now?: Date;
}

interface VerifySessionValueInput {
  sessionValue: string | undefined;
  sessionSecret: string;
  now?: Date;
}

interface CookieOptionsInput {
  isProduction: boolean;
}

interface SessionPayload {
  username: string;
  displayName: string;
  issuedAt: string;
  expiresAt: string;
}

export type SessionVerificationResult =
  | { ok: true; data: SessionPayload }
  | {
      ok: false;
      error: {
        code: "AUTH_REQUIRED" | "SESSION_EXPIRED";
        message: string;
      };
    };

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
}

function isSameSignature(actualSignature: string, expectedSignature: string): boolean {
  const actual = Buffer.from(actualSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function authRequired(): SessionVerificationResult {
  return {
    ok: false,
    error: {
      code: "AUTH_REQUIRED",
      message: "需要先登录",
    },
  };
}

export function createSessionValue({
  user,
  sessionSecret,
  now = new Date(),
}: CreateSessionValueInput): { value: string; expiresAt: Date } {
  const issuedAt = now;
  const expiresAt = new Date(issuedAt.getTime() + SESSION_DURATION_MS);
  const payload: SessionPayload = {
    username: user.username,
    displayName: user.displayName,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, sessionSecret);

  return {
    value: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

export function verifySessionValue({
  sessionValue,
  sessionSecret,
  now = new Date(),
}: VerifySessionValueInput): SessionVerificationResult {
  if (!sessionValue) {
    return authRequired();
  }

  const [encodedPayload, actualSignature] = sessionValue.split(".");

  if (!encodedPayload || !actualSignature || sessionValue.split(".").length !== 2) {
    return authRequired();
  }

  const expectedSignature = signPayload(encodedPayload, sessionSecret);

  if (!isSameSignature(actualSignature, expectedSignature)) {
    return authRequired();
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<SessionPayload>;

    if (
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.issuedAt !== "string" ||
      typeof payload.expiresAt !== "string"
    ) {
      return authRequired();
    }

    if (now.getTime() > new Date(payload.expiresAt).getTime()) {
      return {
        ok: false,
        error: {
          code: "SESSION_EXPIRED",
          message: "登录状态已过期，请重新登录",
        },
      };
    }

    return {
      ok: true,
      data: {
        username: payload.username,
        displayName: payload.displayName,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
      },
    };
  } catch {
    return authRequired();
  }
}

export function getSessionCookieOptions({ isProduction }: CookieOptionsInput) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  };
}
