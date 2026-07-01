// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MasterDataPage from "@/app/(main)/master-data/page";
import {
  confirmMasterDataImport,
  getMasterDataChangeHistory,
  listPaperMaterials,
  previewMasterDataImport,
  resolveMasterDataImportRow,
} from "@/server/actions/master-data-actions";

const actionMocks = vi.hoisted(() => ({
  confirmMasterDataImport: vi.fn(),
  getMasterDataChangeHistory: vi.fn(),
  listPaperMaterials: vi.fn(),
  previewMasterDataImport: vi.fn(),
  resolveMasterDataImportRow: vi.fn(),
}));

vi.mock("@/server/actions/master-data-actions", () => ({
  confirmMasterDataImport: actionMocks.confirmMasterDataImport,
  getMasterDataChangeHistory: actionMocks.getMasterDataChangeHistory,
  listPaperMaterials: actionMocks.listPaperMaterials,
  previewMasterDataImport: actionMocks.previewMasterDataImport,
  resolveMasterDataImportRow: actionMocks.resolveMasterDataImportRow,
}));

const mockedConfirmMasterDataImport = vi.mocked(confirmMasterDataImport);
const mockedGetMasterDataChangeHistory = vi.mocked(getMasterDataChangeHistory);
const mockedListPaperMaterials = vi.mocked(listPaperMaterials);
const mockedPreviewMasterDataImport = vi.mocked(previewMasterDataImport);
const mockedResolveMasterDataImportRow = vi.mocked(resolveMasterDataImportRow);

const paperMaterialListResult = {
  ok: true as const,
  data: {
    total: 2,
    items: [
      {
        id: "paper-1",
        paperCode: "r2",
        paperEncoding: "B04033",
        factoryId: "factory-1",
        factoryName: "供应商A",
        name: "105g高强瓦楞纸",
        paperKind: "corrugating",
        grade: "A",
        gramWeightGsm: 105,
        priceYuanPerTon: 3200,
        burstIndex: undefined,
        ringCrushIndex: undefined,
        completenessStatus: "incomplete" as const,
        missingFields: ["burstIndex", "ringCrushIndex"],
        isActive: true,
      },
      {
        id: "paper-2",
        paperCode: "r3",
        paperEncoding: "B04034",
        factoryId: "factory-1",
        factoryName: "供应商A",
        name: "105g高强瓦楞纸",
        paperKind: "corrugating",
        grade: "A",
        gramWeightGsm: 105,
        priceYuanPerTon: 3210,
        burstIndex: undefined,
        ringCrushIndex: undefined,
        completenessStatus: "incomplete" as const,
        missingFields: ["burstIndex", "ringCrushIndex"],
        isActive: true,
      },
    ],
  },
};

describe("master data multi-source import page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetMasterDataChangeHistory.mockResolvedValue({
      ok: true,
      data: { items: [] },
    });
    mockedListPaperMaterials.mockResolvedValue(paperMaterialListResult);
  });

  it("offers all master data import source types", () => {
    render(<MasterDataPage />);

    const sourceSelect = document.querySelector<HTMLSelectElement>("#master-data-source-type");

    expect(sourceSelect).toBeTruthy();
    expect(Array.from(sourceSelect?.options ?? []).map((option) => option.value)).toEqual([
      "paper_code_table",
      "paper_price_table",
      "quality_standard_table",
    ]);
  });

  it("previews a paper price import, resolves pending match, then confirms and refreshes materials", async () => {
    mockedPreviewMasterDataImport.mockResolvedValue({
      ok: true,
      data: {
        batchId: "batch-price",
        sourceType: "paper_price_table",
        summary: {
          newCount: 0,
          updateCount: 0,
          pendingCount: 1,
          failedCount: 0,
          incompleteCount: 0,
        },
        rows: [
          {
            id: "row-price",
            sheetName: "23-3",
            rowNumber: 2,
            rawData: {},
            normalizedData: {
              supplierShortName: "供应商A",
              paperName: "105g高强瓦楞纸",
              prices: [{ header: "3.8纸价", effectiveDate: "03-08", priceYuanPerTon: 3230 }],
            },
            errors: [{ field: "paperMaterialId", message: "组合信息匹配到多张原纸，请人工确认" }],
            rowStatus: "pending",
            sourceSignature: "paper_price_table|供应商A|105g高强瓦楞纸|105",
            candidateMaterialIds: ["paper-1", "paper-2"],
            changeSet: {},
          },
        ],
      },
    });
    mockedResolveMasterDataImportRow.mockResolvedValue({
      ok: true,
      data: {
        rowId: "row-price",
        rowStatus: "update",
        targetMaterialId: "paper-2",
      },
    });
    mockedConfirmMasterDataImport.mockResolvedValue({
      ok: true,
      data: {
        batchId: "batch-price",
        createdFactoryCount: 0,
        createdMaterialCount: 0,
        updatedMaterialCount: 1,
        skippedFailedRowCount: 0,
      },
    });

    render(<MasterDataPage />);

    const sourceSelect = document.querySelector<HTMLSelectElement>("#master-data-source-type");
    const fileInput = document.querySelector<HTMLInputElement>("input[type='file']");

    if (!sourceSelect || !fileInput) {
      throw new Error("import controls should render");
    }

    fireEvent.change(sourceSelect, { target: { value: "paper_price_table" } });
    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["price"], "纸价.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成预览" }));

    await waitFor(() => {
      expect(mockedPreviewMasterDataImport).toHaveBeenCalledTimes(1);
    });
    expect(mockedPreviewMasterDataImport.mock.calls[0]?.[0].get("sourceType")).toBe(
      "paper_price_table",
    );
    expect(await screen.findByText("r2 | 供应商A | 105g高强瓦楞纸 | 105g")).toBeTruthy();

    const pendingCandidateSelect = Array.from(
      document.querySelectorAll<HTMLSelectElement>("select"),
    ).find((select) => Array.from(select.options).some((option) => option.value === "paper-2"));

    if (!pendingCandidateSelect) {
      throw new Error("pending candidate selector should render");
    }

    fireEvent.change(pendingCandidateSelect, { target: { value: "paper-2" } });
    fireEvent.click(screen.getByRole("button", { name: "确认第 2 行关联" }));

    await waitFor(() => {
      expect(mockedResolveMasterDataImportRow).toHaveBeenCalledWith({
        batchId: "batch-price",
        rowId: "row-price",
        paperMaterialId: "paper-2",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() => {
      expect(mockedConfirmMasterDataImport).toHaveBeenCalledWith("batch-price");
      expect(mockedListPaperMaterials.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });
});
