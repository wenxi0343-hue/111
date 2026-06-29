"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "antd";

import { logout } from "@/server/actions/auth-actions";

export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);

    try {
      const result = await logout();

      if (result.ok) {
        router.replace(result.data.redirectedTo);
        router.refresh();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button aria-label="退出登录" block loading={isSubmitting} onClick={handleLogout}>
      退出登录
    </Button>
  );
}
