import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loadAuthConfig } from "@/modules/auth/config";
import { AUTH_SESSION_COOKIE_NAME, verifySessionValue } from "@/modules/auth/session";

import { LoginForm } from "./_components/login-form";

const SESSION_EXPIRED_MESSAGE = "登录状态已过期，请重新登录";

interface LoginPageProps {
  searchParams?: Promise<{
    reason?: string | string[];
  }>;
}

async function isAlreadyAuthenticated(): Promise<boolean> {
  const configResult = loadAuthConfig();

  if (!configResult.ok) {
    return false;
  }

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const sessionResult = verifySessionValue({
    sessionValue,
    sessionSecret: configResult.data.sessionSecret,
  });

  return sessionResult.ok;
}

async function hasExpiredReason(searchParams: LoginPageProps["searchParams"]): Promise<boolean> {
  const params = searchParams ? await searchParams : undefined;
  const reason = params?.reason;

  return reason === "expired" || (Array.isArray(reason) && reason.includes("expired"));
}

export default async function LoginPage({ searchParams }: LoginPageProps = {}) {
  if (await isAlreadyAuthenticated()) {
    redirect("/dashboard");
  }

  const initialErrorMessage = (await hasExpiredReason(searchParams))
    ? SESSION_EXPIRED_MESSAGE
    : null;

  return (
    <section className="login-page" aria-labelledby="login-title">
      <div className="login-panel">
        <div className="login-heading">
          <p className="login-kicker">纸箱自动配纸工具</p>
          <h1 id="login-title">登录</h1>
          <p>请输入已配置的内部账号和密码。</p>
        </div>
        <LoginForm initialErrorMessage={initialErrorMessage} />
      </div>
    </section>
  );
}
