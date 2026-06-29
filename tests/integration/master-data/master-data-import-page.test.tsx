// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MasterDataPage from "@/app/(main)/master-data/page";
import {
  confirmMasterDataImport,
  previewMasterDataImport,
} from "@/server/actions/master-data-actions";

const actionMocks = vi.hoisted(() => ({
  confirmMasterDataImport: vi.fn(),
  previewMasterDataImport: vi.fn(),
}));

vi.mock("@/server/actions/master-data-actions", () => ({
  confirmMasterDataImport: actionMocks.confirmMasterDataImport,
  previewMasterDataImport: actionMocks.previewMasterDataImport,
}));

const mockedPreviewMasterDataImport = vi.mocked(previewMasterDataImport);
const mockedConfirmMasterDataImport = vi.mocked(confirmMasterDataImport);

const previewRows = [
  {
    sheetName: "原纸代码",
    rowNumber: 3,
    rawData: {
      原纸代码: "r2",
      原纸编码: "B04033",
      克重: "105",
      原纸供应商简称: "供应商A",
      原纸名称: "105g高强瓦楞纸",
    },
    normalizedData: {
      paperCode: "r2",
      paperEncoding: "B04033",
      gramWeightGsm: 105,
      supplierShortName: "供应商A",
      paperName: "105g高强瓦楞纸",
    },
    errors: [],
    rowStatus: "new" as const,
    factoryName: "供应商A",
    completenessStatus: "incomplete" as const,
    missingFields: ["paperKind", "priceYuanPerTon"],
    warnings: [],
  },
  {
    sheetName: "原纸代码",
    rowNumber: 4,
    rawData: {
      原纸代码: "",
      原纸编码: "B05001",
      克重: "120",
      原纸供应商简称: "供应商B",
      原纸名称: "120g测试面纸",
    },
    normalizedData: {
      paperCode: "",
      paperEncoding: "B05001",
      gramWeightGsm: 120,
      supplierShortName: "供应商B",
      paperName: "120g测试面纸",
    },
    errors: [{ field: "paperCode", message: "缺少原纸代码" }],
    rowStatus: "failed" as const,
    factoryName: "供应商B",
    completenessStatus: "incomplete" as const,
    missingFields: ["paperCode"],
    warnings: [],
  },
];

function uploadPaperCodeWorkbook() {
  const input = screen.getByLabelText("选择原纸代码表") as HTMLInputElement;
  const file = new File(["paper-code"], "原纸代码表.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  fireEvent.change(input, { target: { files: [file] } });

  return file;
}

async function renderAndPreview() {
  mockedPreviewMasterDataImport.mockResolvedValue({
    ok: true,
    data: {
      batchId: "batch-1",
      summary: {
        newCount: 2,
        updateCount: 0,
        pendingCount: 0,
        failedCount: 1,
        incompleteCount: 2,
      },
      rows: previewRows,
    },
  });
  render(<MasterDataPage />);
  const file = uploadPaperCodeWorkbook();

  fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

  await screen.findByText("新增 2");

  return file;
}

describe("master data import page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders paper code import entry, file selector and preview area", () => {
    render(<MasterDataPage />);

    expect(screen.getByRole("heading", { name: "数据维护" })).toBeTruthy();
    expect(screen.getByText("原纸代码表导入")).toBeTruthy();
    expect(screen.getByLabelText("导入来源")).toBeTruthy();
    expect(screen.getByLabelText("选择原纸代码表")).toBeTruthy();
    expect(screen.getByText("导入预览")).toBeTruthy();
  });

  it("shows summary counts after upload preview succeeds", async () => {
    await renderAndPreview();

    expect(screen.getByText("新增 2")).toBeTruthy();
    expect(screen.getByText("失败 1")).toBeTruthy();
    expect(screen.getByText("资料不完整 2")).toBeTruthy();
    expect(screen.getByText("待确认 0")).toBeTruthy();
    expect(mockedPreviewMasterDataImport).toHaveBeenCalledTimes(1);
    expect(mockedPreviewMasterDataImport.mock.calls[0]?.[0]).toBeInstanceOf(FormData);
  });

  it("shows row validation errors without exposing internal details", async () => {
    await renderAndPreview();
    const pageText = document.body.textContent ?? "";

    expect(screen.getByText("缺少原纸代码")).toBeTruthy();
    expect(pageText).not.toContain("stack");
    expect(pageText).not.toContain("postgresql://");
    expect(pageText).not.toContain("Error:");
  });

  it("shows success summary after confirm succeeds", async () => {
    mockedConfirmMasterDataImport.mockResolvedValue({
      ok: true,
      data: {
        batchId: "batch-1",
        createdFactoryCount: 2,
        createdMaterialCount: 2,
        updatedMaterialCount: 0,
        skippedFailedRowCount: 1,
      },
    });
    await renderAndPreview();

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    expect(
      await screen.findByText("入库完成：新增 2 张原纸，更新 0 张原纸，跳过 1 行。"),
    ).toBeTruthy();
    expect(mockedConfirmMasterDataImport).toHaveBeenCalledWith("batch-1");
  });

  it("shows validation error and restores confirm button when confirm fails", async () => {
    mockedConfirmMasterDataImport.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "原纸代码 r2 已存在，请重新预览后再确认",
      },
    });
    await renderAndPreview();

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    expect(await screen.findByText("原纸代码 r2 已存在，请重新预览后再确认")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "确认入库" }).hasAttribute("disabled")).toBe(false);
    });
  });
});
