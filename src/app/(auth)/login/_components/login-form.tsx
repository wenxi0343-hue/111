"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Input } from "antd";

import { loginWithPassword } from "@/server/actions/auth-actions";

const REQUIRED_MESSAGE = "请输入账号和密码";

interface LoginFormProps {
  initialErrorMessage?: string | null;
}

export function LoginForm({ initialErrorMessage = null }: LoginFormProps = {}) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(initialErrorMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setErrorMessage(null);

    if (!username || !password) {
      setErrorMessage(REQUIRED_MESSAGE);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await loginWithPassword({ username, password });

      if (result.ok) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setErrorMessage(result.error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form aria-label="登录表单" className="login-form" onSubmit={handleSubmit}>
      {errorMessage ? (
        <Alert className="login-alert" message={errorMessage} showIcon type="error" />
      ) : null}

      <label className="login-field" htmlFor="username">
        <span>账号</span>
        <Input id="username" name="username" autoComplete="username" disabled={isSubmitting} />
      </label>

      <label className="login-field" htmlFor="password">
        <span>密码</span>
        <Input.Password
          id="password"
          name="password"
          autoComplete="current-password"
          disabled={isSubmitting}
        />
      </label>

      <Button aria-label="登录" block htmlType="submit" loading={isSubmitting} type="primary">
        登录
      </Button>
    </form>
  );
}
