// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChangeHistoryModal } from "@/app/(main)/master-data/_components/change-history-modal";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";

const priceChange: MasterDataChangeLogRecord = {
  id: "price-log",
  entityType: "paper_material",
  entityId: "paper-1",
  changeSource: "manual",
  changedFields: {
    price_yuan_per_ton: {
      before: 3300,
      after: 3400,
    },
  },
  reason: "供应商调价",
  changedBy: "operator",
  createdAt: new Date("2026-06-30T08:00:00.000Z"),
};

describe("change history modal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders field changes with old value, new value, operator, time, reason and source", () => {
    render(
      <ChangeHistoryModal
        isOpen
        entityName="r2"
        items={[priceChange]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "修改历史" })).toBeTruthy();
    expect(screen.getByText("r2")).toBeTruthy();
    expect(screen.getByText("当前纸价")).toBeTruthy();
    expect(screen.getByText("3300")).toBeTruthy();
    expect(screen.getByText("3400")).toBeTruthy();
    expect(screen.getByText("operator")).toBeTruthy();
    expect(screen.getByText("2026-06-30 08:00")).toBeTruthy();
    expect(screen.getByText("供应商调价")).toBeTruthy();
    expect(screen.getByText("手工修改")).toBeTruthy();
  });

  it("renders empty history state", () => {
    render(
      <ChangeHistoryModal isOpen entityName="missing-paper" items={[]} onClose={vi.fn()} />,
    );

    expect(screen.getByText("暂无修改历史")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();

    render(
      <ChangeHistoryModal
        isOpen
        entityName="r2"
        items={[priceChange]}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(onClose).toHaveBeenCalled();
  });
});
