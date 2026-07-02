// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HistoryPage from "@/app/(main)/history/page";
import { listRecentMatchingSchemes } from "@/server/actions/matching-scheme-history";

const mocks = vi.hoisted(() => ({
  getDatabaseUrl: vi.fn(),
  createDatabaseClient: vi.fn(),
  createDrizzleMatchingSchemeHistoryRepository: vi.fn(),
  listRecentMatchingSchemes: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDatabaseUrl: mocks.getDatabaseUrl,
  createDatabaseClient: mocks.createDatabaseClient,
}));

vi.mock("@/server/actions/matching-scheme-history", () => ({
  createDrizzleMatchingSchemeHistoryRepository:
    mocks.createDrizzleMatchingSchemeHistoryRepository,
  listRecentMatchingSchemes: mocks.listRecentMatchingSchemes,
}));

const mockedListRecentMatchingSchemes = vi.mocked(listRecentMatchingSchemes);

describe("history page PDF exports", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDatabaseUrl.mockReturnValue({
      ok: true,
      data: "postgres://example",
    });
    mocks.createDatabaseClient.mockReturnValue({
      db: {},
      close: vi.fn(async () => {}),
    });
    mocks.createDrizzleMatchingSchemeHistoryRepository.mockReturnValue({});
    mockedListRecentMatchingSchemes.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "scheme-1",
          createdAt: new Date("2026-07-02T08:30:00.000Z"),
          finalStatus: "qualified",
          isManuallyAdjusted: true,
          warningMessages: [],
          exportRecords: [
            {
              type: "full_report",
              exportedAt: "2026-07-02T10:30:00.000Z",
            },
            {
              type: "summary_sheet",
              exportedAt: "2026-07-02T10:35:00.000Z",
            },
          ],
        },
      ],
    });
  });

  it("shows PDF export links and past export records for saved schemes", async () => {
    render(await HistoryPage());

    const fullReportLink = screen.getByRole("link", { name: "完整报告 PDF" });
    const summarySheetLink = screen.getByRole("link", { name: "精简方案表 PDF" });

    expect(fullReportLink.getAttribute("href")).toBe(
      "/api/exports/matching-schemes/scheme-1?type=full_report",
    );
    expect(summarySheetLink.getAttribute("href")).toBe(
      "/api/exports/matching-schemes/scheme-1?type=summary_sheet",
    );
    expect(screen.getByText("完整报告 2026年7月2日 18:30")).toBeTruthy();
    expect(screen.getByText("精简方案表 2026年7月2日 18:35")).toBeTruthy();
  });
});
