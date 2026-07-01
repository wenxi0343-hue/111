// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaperMaterialEditForm } from "@/app/(main)/master-data/_components/paper-material-edit-form";

const material = {
  id: "paper-1",
  paperCode: "r2",
  paperEncoding: "B04033",
  name: "105g high strength corrugating",
  priceYuanPerTon: 3300,
  burstIndex: 2.2,
  ringCrushIndex: 7.5,
};

describe("paper material edit form", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows business validation message for important field changes without reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "修改纸价、克重、用途、适用瓦型、强度指标或启用状态时需要填写修改原因",
      },
    });

    render(<PaperMaterialEditForm material={material} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("当前纸价"), {
      target: { value: "3400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        paperMaterialId: "paper-1",
        patch: {
          paperCode: "r2",
          paperEncoding: "B04033",
          name: "105g high strength corrugating",
          priceYuanPerTon: 3400,
          burstIndex: 2.2,
          ringCrushIndex: 7.5,
        },
        reason: "",
      });
    });

    expect(await screen.findByText(/需要填写修改原因/)).toBeTruthy();
    expect(screen.queryByText(/Error:/)).toBeNull();
    expect(screen.queryByText(/at PaperMaterialEditForm/)).toBeNull();
  });
});
