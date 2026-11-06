"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "antd";

interface AntdProviderProps {
  children: ReactNode;
}

export function AntdProvider({ children }: AntdProviderProps) {
  return (
    <ConfigProvider theme={{ cssVar: { key: "css-var-_R_39f_" }, zeroRuntime: true }}>
      {children}
    </ConfigProvider>
  );
}
