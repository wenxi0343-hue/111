export const AUTH_CONFIG_UNAVAILABLE_MESSAGE = "登录服务暂不可用，请联系系统维护人员";

export interface AuthUser {
  username: string;
  displayName: string;
  passwordHash: string;
}

export interface AuthConfig {
  sessionSecret: string;
  users: AuthUser[];
}

export type AuthConfigErrorCode = "AUTH_CONFIG_UNAVAILABLE";

export type AuthConfigResult =
  | { ok: true; data: AuthConfig }
  | {
      ok: false;
      error: {
        code: AuthConfigErrorCode;
        message: string;
      };
    };
