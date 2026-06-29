// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "@/app/(main)/_components/logout-button";
import { logout } from "@/server/actions/auth-actions";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/server/actions/auth-actions", () => ({
  logout: vi.fn(),
}));

const mockedLogout = vi.mocked(logout);

describe("logout button", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLogout.mockResolvedValue({
      ok: true,
      data: {
        redirectedTo: "/login",
      },
    });
  });

  it("logs out and moves the user back to login", async () => {
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await waitFor(() => {
      expect(mockedLogout).toHaveBeenCalled();
      expect(mocks.replace).toHaveBeenCalledWith("/login");
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });
});
