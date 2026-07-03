// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HistoryPage from "@/app/(main)/history/page";
import {
  listHistoricalOrderHabitSummaries,
  previewHistoricalOrderImport,
} from "@/server/actions/historical-order-actions";
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
const mockedPreviewHistoricalOrderImport = vi.mocked(previewHistoricalOrderImport);
const mockedListHistoricalOrderHabitSummaries = vi.mocked(listHistoricalOrderHabitSummaries);

function uploadHistoricalOrderWorkbook() {
  const input = screen.getByLabelText("选择历史订单 .xlsx 文件") as HTMLInputElement;
  const file = new File(["historical-order"], "历史订单.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  fireEvent.change(input, { target: { files: [file] } });

  return file;
}

describe("historical order import page", () => {
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
        items: [],
      },
    });
  });

  it("renders upload entry for historical order xlsx files", async () => {
    render(await HistoryPage());

    expect(screen.getByRole("heading", { name: "历史订单导入" })).toBeTruthy();
    expect(screen.getByLabelText("选择历史订单 .xlsx 文件")).toBeTruthy();
    expect(screen.getByRole("button", { name: "生成历史订单预览" })).toBeTruthy();
  });

  it("shows summary and business row errors after preview succeeds", async () => {
    mockedPreviewHistoricalOrderImport.mockResolvedValue({
      ok: true,
      data: {
        batchId: "batch-1",
        summary: {
          importedCount: 4,
          statisticalCount: 2,
          pendingCount: 1,
          exceptionCount: 1,
          failedCount: 1,
        },
        sizeBucketPreview: {
          confirmed: false,
          smallMaxVolume: 9000000,
          mediumMaxVolume: 27000000,
        },
        rows: [
          {
            id: "row-1",
            sheetName: "历史订单",
            rowNumber: 2,
            rawData: { 纸质: "dc" },
            normalizedData: {
              orderDate: "2026-07-01",
              productName: "脱敏产品A",
              lengthMm: 300,
              widthMm: 200,
              heightMm: 150,
              quantity: 1000,
              paperCodeText: "dc",
            },
            rowStatus: "pending",
            paperCodeMatchResult: {
              status: "case_mismatch",
              input: "dc",
              normalizedInput: "dc",
              candidates: [{ id: "material-dc", paperCode: "DC" }],
              message: "原纸代码疑似大小写错误，请人工确认候选原纸",
            },
            matchedMaterialIds: [],
            candidateMaterialIds: ["material-dc"],
            errors: [{ field: "paperCodeText", message: "原纸代码疑似大小写错误" }],
          },
          {
            id: "row-2",
            sheetName: "历史订单",
            rowNumber: 3,
            rawData: {},
            normalizedData: {},
            rowStatus: "failed",
            paperCodeMatchResult: {
              status: "unmatched",
              input: "",
              normalizedInput: "",
              message: "无法匹配原纸代码",
            },
            matchedMaterialIds: [],
            candidateMaterialIds: [],
            errors: [{ field: "productName", message: "缺少产品名称或类别" }],
          },
        ],
      },
    });
    render(await HistoryPage());

    uploadHistoricalOrderWorkbook();
    fireEvent.click(screen.getByRole("button", { name: "生成历史订单预览" }));

    expect(await screen.findByText("可入库 4")).toBeTruthy();
    expect(screen.getByText("可统计 2")).toBeTruthy();
    expect(screen.getByText("待确认 1")).toBeTruthy();
    expect(screen.getByText("异常 1")).toBeTruthy();
    expect(screen.getByText("失败 1")).toBeTruthy();
    expect(screen.getByText("原纸代码疑似大小写错误")).toBeTruthy();
    expect(screen.getByText("缺少产品名称或类别")).toBeTruthy();
    expect(document.body.textContent).not.toContain("postgres://");
    expect(document.body.textContent).not.toContain("Error:");
  });
});
