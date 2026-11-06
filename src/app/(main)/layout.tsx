import Link from "next/link";
import type { ReactNode } from "react";

import { readAuthenticatedUser } from "@/server/guards/auth";

import { LogoutButton } from "./_components/logout-button";

interface MainLayoutProps {
  children: ReactNode;
}

export default async function MainLayout({ children }: MainLayoutProps) {
  const user = await readAuthenticatedUser();

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-brand">
          <strong>纸箱自动配纸工具</strong>
          <span>单次配纸</span>
        </div>
        <div className="app-session">
          <span>{user ? "已登录" : "未登录"}</span>
          {user ? <LogoutButton /> : null}
        </div>
      </header>
      <main className="app-main">{children}</main>
      <nav className="app-tabbar" aria-label="底部模块导航">
        <Link href="/matching" aria-label="配纸">
          <span aria-hidden="true">▦</span>
          <strong>配纸</strong>
        </Link>
        <Link href="/history" aria-label="历史方案">
          <span aria-hidden="true">▤</span>
          <strong>历史方案</strong>
        </Link>
        <Link href="/review-orders" aria-label="评审工单">
          <span aria-hidden="true">▦</span>
          <strong>评审工单</strong>
        </Link>
      </nav>
    </div>
  );
}
