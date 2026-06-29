import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { loadAuthConfig } from "@/modules/auth/config";
import { AUTH_SESSION_COOKIE_NAME, verifySessionValue } from "@/modules/auth/session";

import { LogoutButton } from "./_components/logout-button";

interface MainLayoutProps {
  children: ReactNode;
}

type MainLayoutAuthStatus = "authenticated" | "required" | "expired";

const navItems = [
  { href: "/dashboard", label: "工作台" },
  { href: "/matching", label: "配纸" },
  { href: "/master-data", label: "数据维护" },
  { href: "/history", label: "历史方案" },
  { href: "/settings", label: "设置" },
];

async function getMainLayoutAuthStatus(): Promise<MainLayoutAuthStatus> {
  const configResult = loadAuthConfig();

  if (!configResult.ok) {
    return "required";
  }

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value;
  const sessionResult = verifySessionValue({
    sessionValue,
    sessionSecret: configResult.data.sessionSecret,
  });

  if (sessionResult.ok) {
    return "authenticated";
  }

  return sessionResult.error.code === "SESSION_EXPIRED" ? "expired" : "required";
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const authStatus = await getMainLayoutAuthStatus();

  if (authStatus === "expired") {
    redirect("/login?reason=expired");
  }

  if (authStatus === "required") {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-title">纸箱自动配纸工具</div>
        <nav className="app-nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-footer">
          <LogoutButton />
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
