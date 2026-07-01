// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaperMaterialList } from "@/app/(main)/master-data/_components/paper-material-list";
import type { PaperMaterialListItem } from "@/modules/master-data/list-paper-materials";

const completeMaterial: PaperMaterialListItem = {
  id: "paper-1",
  paperCode: "r2",
  paperEncoding: "B04033",
  factoryId: "factory-1",
  factoryName: "供应商A",
  name: "105g高强瓦楞纸",
  paperKind: "corrugating",
  grade: "A",
  gramWeightGsm: 105,
  priceYuanPerTon: 3300,
  burstIndex: 2.2,
  ringCrushIndex: 7.5,
  completenessStatus: "complete",
  missingFields: [],
  isActive: true,
};

const incompleteMaterial: PaperMaterialListItem = {
  id: "paper-2",
  paperCode: "r3",
  paperEncoding: "B05001",
  factoryId: "factory-2",
  factoryName: "供应商B",
  name: "120g测试面纸",
  paperKind: "linerboard",
  grade: "B",
  gramWeightGsm: 120,
  priceYuanPerTon: undefined,
  burstIndex: undefined,
  ringCrushIndex: undefined,
  completenessStatus: "incomplete",
  missingFields: ["priceYuanPerTon", "burstIndex", "ringCrushIndex"],
  isActive: true,
};

describe("paper material list", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders paper material fields, completeness and active status", () => {
    render(
      <PaperMaterialList
        initialItems={[completeMaterial, incompleteMaterial]}
        total={2}
        onFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByText("原纸资料库")).toBeTruthy();
    expect(screen.getByText("r2")).toBeTruthy();
    expect(screen.getByText("105g高强瓦楞纸")).toBeTruthy();
    expect(screen.getByText("供应商A")).toBeTruthy();
    expect(screen.getByText("105g")).toBeTruthy();
    expect(screen.getByText("3300 元/吨")).toBeTruthy();
    expect(screen.getAllByText("完整").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("启用")).toHaveLength(2);
    expect(screen.getByText("缺少纸价、耐破指数、横向环压指数")).toBeTruthy();
  });

  it("requests incomplete materials when the incomplete filter is selected", async () => {
    const onFilterChange = vi.fn().mockResolvedValue({
      items: [incompleteMaterial],
      total: 1,
    });

    render(
      <PaperMaterialList
        initialItems={[completeMaterial, incompleteMaterial]}
        total={2}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("资料完整性"), {
      target: { value: "incomplete" },
    });

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith({ completenessStatus: "incomplete" });
    });
    expect(await screen.findByText("r3")).toBeTruthy();
    expect(screen.queryByText("r2")).toBeNull();
  });

  it("shows stopped paper materials and keeps a history action available", () => {
    const onViewHistory = vi.fn();

    render(
      <PaperMaterialList
        initialItems={[{ ...completeMaterial, isActive: false }]}
        total={1}
        onFilterChange={vi.fn()}
        onViewHistory={onViewHistory}
      />,
    );

    expect(screen.getByText("停用")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "查看历史" }));

    expect(onViewHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "paper-1", isActive: false }),
    );
  });
});
