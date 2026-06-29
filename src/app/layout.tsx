import type { Metadata } from "next";
import type { ReactNode } from "react";
import "antd/dist/reset.css";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "纸箱自动配纸工具",
  description: "单次纸箱配纸、成本核算、强度校核和方案导出工具",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
