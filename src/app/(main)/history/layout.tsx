import type { ReactNode } from "react";

import { requireAuthenticatedPage } from "@/server/guards/auth";

interface HistoryProtectedLayoutProps {
  children: ReactNode;
}

export default async function HistoryProtectedLayout({ children }: HistoryProtectedLayoutProps) {
  await requireAuthenticatedPage({ nextPath: "/history" });

  return children;
}
