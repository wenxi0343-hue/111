// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PendingMatchTable } from "@/app/(main)/master-data/_components/pending-match-table";

describe("pending match table", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows pending candidates and submits the selected material", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);

    render(
      <PendingMatchTable
        rows={[
          {
            id: "row-1",
            rowNumber: 5,
            sourceLabel: "供应商A / 105g高强瓦楞纸",
            reason: "组合信息匹配到多张原纸，请人工确认",
            candidateMaterialIds: ["paper-1", "paper-2"],
          },
        ]}
        candidates={[
          {
            id: "paper-1",
            paperCode: "r2",
            name: "105g高强瓦楞纸",
            factoryName: "供应商A",
            gramWeightGsm: 105,
          },
          {
            id: "paper-2",
            paperCode: "r3",
            name: "105g普通瓦楞纸",
            factoryName: "供应商A",
            gramWeightGsm: 105,
          },
        ]}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText("待确认关联")).toBeTruthy();
    expect(screen.getByText("组合信息匹配到多张原纸，请人工确认")).toBeTruthy();
    expect(screen.getByText("r2 | 供应商A | 105g高强瓦楞纸 | 105g")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("第 5 行选择候选原纸"), {
      target: { value: "paper-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认第 5 行关联" }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith({
        rowId: "row-1",
        paperMaterialId: "paper-2",
      });
    });
  });
});
