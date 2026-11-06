import { describe, expect, it } from "vitest";

import { validateCreateReviewOrder } from "@/modules/review-orders/validate-review-order";
import type { BoxSpecInput } from "@/modules/box-spec/types";

const validBoxSpec: BoxSpecInput = {
  lengthMm: "498",
  widthMm: "340",
  heightMm: "253",
  structureType: "0201",
  formingMethod: "staple",
  productType: "食品",
  productWeightKg: "10",
  arrangement: "single_row",
  productionQuantity: "1000",
};

describe("validateCreateReviewOrder", () => {
  it("通过：无样品最小必填集", () => {
    const result = validateCreateReviewOrder({
      customerName: "张师",
      productName: "五层脱水莴笋片箱",
      boxSpec: validBoxSpec,
      hasSample: false,
      requestedLayerCount: 5,
    });

    expect(result.ok).toBe(true);
  });

  it("拦截：缺少客户名称与产品名称", () => {
    const result = validateCreateReviewOrder({
      customerName: "  ",
      productName: "",
      boxSpec: validBoxSpec,
      hasSample: false,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      const fields = result.error.fieldErrors.map((error) => error.field);
      expect(fields).toContain("customerName");
      expect(fields).toContain("productName");
    }
  });

  it("拦截：有样品但未选期望检测项", () => {
    const result = validateCreateReviewOrder({
      customerName: "x",
      productName: "y",
      boxSpec: validBoxSpec,
      hasSample: true,
      expectedTestItems: [],
    });

    expect(result.ok).toBe(false);
  });

  it("拦截：层数意向非法", () => {
    const result = validateCreateReviewOrder({
      customerName: "x",
      productName: "y",
      boxSpec: validBoxSpec,
      hasSample: false,
      requestedLayerCount: 4,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.fieldErrors.some((error) => error.field === "requestedLayerCount")).toBe(true);
    }
  });

  it("通过：有样品且选择合法检测项", () => {
    const result = validateCreateReviewOrder({
      customerName: "x",
      productName: "y",
      boxSpec: validBoxSpec,
      hasSample: true,
      expectedTestItems: ["尺寸", "配纸"],
    });

    expect(result.ok).toBe(true);
  });

  it("拦截：纸箱尺寸非法时合并 boxSpec 字段错误", () => {
    const result = validateCreateReviewOrder({
      customerName: "x",
      productName: "y",
      boxSpec: { ...validBoxSpec, lengthMm: "50" },
      hasSample: false,
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.error.fieldErrors.some((error) => error.field.startsWith("boxSpec."))).toBe(true);
    }
  });
});
