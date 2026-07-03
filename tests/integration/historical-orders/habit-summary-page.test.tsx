// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HistoryPage from "@/app/(main)/history/page";
import { listHistoricalOrderHabitSummaries } from "@/server/actions/historical-order-actions";
import { listRecentMatchingSchemes } from "@/server/actions/matching-scheme-history";

const mocks = vi.hoisted(() => ({
  getDatabaseUrl: vi.fn(),
  createDatabaseClient: vi.fn(),
  createDrizzleMatchingSchemeHistoryRepository: vi.fn(),
  listRecentMatchingSchemes: vi.fn(),
  previewHistoricalOrderImport: vi.fn(),
  listHistoricalOrderHabitSummaries: vi.fn(),
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

vi.mock("@/server/actions/historical-order-actions", () => ({
  previewHistoricalOrderImport: mocks.previewHistoricalOrderImport,
  listHistoricalOrderHabitSummaries: mocks.listHistoricalOrderHabitSummaries,
}));

const mockedListRecentMatchingSchemes = vi.mocked(listRecentMatchingSchemes);
const mockedListHistoricalOrderHabitSummaries = vi.mocked(listHistoricalOrderHabitSummaries);

describe("historical order habit summary page", () => {
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
      data: [],
    });
    mockedListHistoricalOrderHabitSummaries.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            importBatchId: "batch-1",
            dimensionType: "product",
            dimensionKey: "脱敏电子产品",
            layerCount: 3,
            flute: "B",
            factoryNames: ["脱敏纸厂A"],
            gramWeights: [140],
            orderCount: 3,
            frequency: 0.75,
          },
          {
            importBatchId: "batch-1",
            dimensionType: "size_bucket",
            dimensionKey: "小箱",
            layerCount: 3,
            flute: "B",
            factoryNames: ["脱敏纸厂A"],
            gramWeights: [140],
            orderCount: 2,
            frequency: 0.5,
          },
          {
            importBatchId: "batch-1",
            dimensionType: "weight_bucket",
            dimensionKey: "≤20kg",
            layerCount: 5,
            flute: "BC",
            factoryNames: ["脱敏纸厂B"],
            gramWeights: [170],
            orderCount: 1,
            frequency: 0.25,
          },
        ],
      },
    });
  });

  it("renders product, size, and weight habit summaries without customer or cost entries", async () => {
    render(await HistoryPage());

    expect(screen.getByRole("heading", { name: "历史配纸习惯摘要" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "产品习惯" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "尺寸区间习惯" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "重量区间习惯" })).toBeTruthy();
    expect(screen.getByText("脱敏电子产品")).toBeTruthy();
    expect(screen.getByText("小箱")).toBeTruthy();
    expect(screen.getByText("≤20kg")).toBeTruthy();
    expect(screen.getAllByText("3 层 / B 瓦").length).toBeGreaterThan(0);
    expect(screen.getAllByText("脱敏纸厂A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("140g").length).toBeGreaterThan(0);
    expect(screen.getByText("3 次")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(document.body.textContent).not.toContain("客户档案");
    expect(document.body.textContent).not.toContain("客户偏好");
    expect(document.body.textContent).not.toContain("成本趋势");
  });
});
