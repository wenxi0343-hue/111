// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoxSpecForm } from "@/app/(main)/matching/_components/box-spec-form";

const actions = vi.hoisted(() => ({
  generateMatchingScheme: vi.fn().mockResolvedValue({ ok: false, error: { message: "暂停" } }),
  saveConfirmedMatchingScheme: vi.fn(),
}));
vi.mock("@/server/actions/matching-actions", () => actions);
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("切换尺寸类型时保留数字并显示相应标签", () => {
  render(<BoxSpecForm />);
  const input = screen.getByLabelText("纸箱内长（mm）") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("尺寸类型"), { target: { value: "outer" } });
  expect((screen.getByLabelText("纸箱外长（mm）") as HTMLInputElement).value).toBe("500");
  expect(screen.getByLabelText("纸箱外宽（mm）")).toBeTruthy();
  expect(screen.getByLabelText("纸箱外高（mm）")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("尺寸类型"), { target: { value: "inner" } });
  expect((screen.getByLabelText("纸箱内长（mm）") as HTMLInputElement).value).toBe("500");
});

it("印刷选项默认否且可选择是", () => {
  render(<BoxSpecForm />);
  const printing = screen.getByLabelText("是否印刷") as HTMLSelectElement;
  expect(printing.value).toBe("no");
  fireEvent.change(printing, { target: { value: "yes" } });
  expect(printing.value).toBe("yes");
});

it("选择纸箱层数且不显示内装物输入", () => {
  render(<BoxSpecForm />);
  const layers = screen.getByLabelText("纸箱层数") as HTMLSelectElement;
  expect(layers.value).toBe("3");
  for (const value of ["5", "7", "3"]) {
    fireEvent.change(layers, { target: { value } });
    expect(layers.value).toBe(value);
  }
  expect(screen.queryByLabelText("堆码层数（层）")).toBeNull();
  expect(screen.queryByLabelText("纸箱结构类型")).toBeNull();
  expect(screen.queryByLabelText("产品类型")).toBeNull();
  expect(screen.queryByLabelText("内装物重量（kg）")).toBeNull();
  expect(screen.queryByLabelText("内装物排列方式")).toBeNull();
  expect(screen.queryByText("特殊要求")).toBeNull();
  expect(screen.queryByLabelText("模切工艺")).toBeNull();
  expect(screen.queryByLabelText("戳穿强度要求")).toBeNull();
  expect(screen.getByLabelText("其他特殊说明")).toBeTruthy();
});

it("输入尺寸后按层数显示各瓦型面积", async () => {
  render(<BoxSpecForm />);
  const button = screen.getByRole("button", { name: "生成方案" }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("纸箱内长（mm）"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("纸箱内宽（mm）"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("纸箱内高（mm）"), { target: { value: "250" } });
  await act(async () => {
    fireEvent.submit(button.closest("form")!);
  });
  expect(screen.getByText("A、B、E 瓦")).toBeTruthy();
  expect(screen.getByText("C 瓦")).toBeTruthy();
  expect(screen.getByText(/0\.935 m²/)).toBeTruthy();
  expect(screen.getByText(/0\.938 m²/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("纸箱层数"), { target: { value: "5" } });
  await act(async () => {
    fireEvent.submit(button.closest("form")!);
  });
  expect(screen.getByText("BC、BA、AC 瓦")).toBeTruthy();
  expect(screen.getByText("BE 瓦")).toBeTruthy();
  expect(screen.getByText(/0\.947 m²/)).toBeTruthy();
  expect(screen.getByText(/0\.938 m²/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("纸箱层数"), { target: { value: "7" } });
  await act(async () => {
    fireEvent.submit(button.closest("form")!);
  });
  expect(screen.getByText("BAC 瓦")).toBeTruthy();
  expect(screen.getByText(/0\.964 m²/)).toBeTruthy();
  expect(actions.generateMatchingScheme).not.toHaveBeenCalled();
});

it("物理指标默认隐藏，切换后保留单独填写的值", () => {
  render(<BoxSpecForm />);
  const toggle = screen.getByRole("switch", { name: "物理指标要求" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(screen.queryByLabelText("空纸箱重量（kg）")).toBeNull();
  fireEvent.click(toggle);
  for (const label of [
    "空纸箱重量（kg）",
    "内装物重量（kg）",
    "堆码层数（层）",
    "边压（kN/m）",
    "耐破",
    "空箱抗压（N）",
  ]) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
  fireEvent.change(screen.getByLabelText("空纸箱重量（kg）"), { target: { value: "0.5" } });
  fireEvent.change(screen.getByLabelText("堆码层数（层）"), { target: { value: "4" } });
  fireEvent.click(toggle);
  expect(screen.queryByLabelText("空纸箱重量（kg）")).toBeNull();
  fireEvent.click(toggle);
  expect((screen.getByLabelText("空纸箱重量（kg）") as HTMLInputElement).value).toBe("0.5");
  expect((screen.getByLabelText("堆码层数（层）") as HTMLInputElement).value).toBe("4");
});
