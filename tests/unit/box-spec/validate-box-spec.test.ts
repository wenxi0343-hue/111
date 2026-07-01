import { describe, expect, it } from "vitest";

import {
  isStackingRequired,
  validateBoxSpecInput,
} from "@/modules/box-spec/validate-box-spec";
import type { BoxSpecInput, NormalizedBoxSpec } from "@/modules/box-spec/types";

function createValidInput(overrides: Partial<BoxSpecInput> = {}): BoxSpecInput {
  return {
    lengthMm: 500,
    widthMm: 300,
    heightMm: 250,
    structureType: "0201",
    formingMethod: "glue",
    productType: "食品",
    productWeightKg: 10,
    arrangement: "single_row",
    productionQuantity: 1000,
    ...overrides,
  };
}

function expectFieldError(input: BoxSpecInput, field: string, message: string): void {
  const result = validateBoxSpecInput(input);

  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected validation to fail");
  }

  expect(result.error.fieldErrors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        field,
        message: expect.stringContaining(message),
      }),
    ]),
  );
}

function expectValid(input: BoxSpecInput): NormalizedBoxSpec {
  const result = validateBoxSpecInput(input);

  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected validation to pass: ${JSON.stringify(result.error.fieldErrors)}`);
  }

  return result.data;
}

describe("validateBoxSpecInput", () => {
  it("accepts complete input without stacking layers and marks stacking as not required", () => {
    const normalizedInput = expectValid(createValidInput());

    expect(normalizedInput.stackingRequirement).toEqual({
      status: "not_required",
      displayText: "未填写堆码层数，承重未校核",
    });
    expect(isStackingRequired(normalizedInput)).toBe(false);
  });

  it("accepts valid stacking layers and marks stacking as required", () => {
    const normalizedInput = expectValid(createValidInput({ stackingLayers: 5 }));

    expect(normalizedInput.stackingRequirement).toEqual({
      status: "required",
      stackingLayers: 5,
      displayText: "已填写堆码层数 5 层，承重纳入本次判断",
    });
    expect(isStackingRequired(normalizedInput)).toBe(true);
  });

  it("accepts minimum boundary values", () => {
    const normalizedInput = expectValid(
      createValidInput({
        lengthMm: 100,
        widthMm: 100,
        heightMm: 100,
        productWeightKg: 0.5,
        stackingLayers: 1,
        productionQuantity: 1,
      }),
    );

    expect(normalizedInput).toMatchObject({
      lengthMm: 100,
      widthMm: 100,
      heightMm: 100,
      productWeightKg: 0.5,
      productionQuantity: 1,
    });
    expect(normalizedInput.stackingRequirement).toMatchObject({
      status: "required",
      stackingLayers: 1,
    });
  });

  it("accepts maximum boundary values", () => {
    const normalizedInput = expectValid(
      createValidInput({
        lengthMm: 2000,
        widthMm: 1500,
        heightMm: 1500,
        productWeightKg: 100,
        stackingLayers: 30,
      }),
    );

    expect(normalizedInput).toMatchObject({
      lengthMm: 2000,
      widthMm: 1500,
      heightMm: 1500,
      productWeightKg: 100,
    });
    expect(normalizedInput.stackingRequirement).toMatchObject({
      status: "required",
      stackingLayers: 30,
    });
  });

  it.each([
    ["lengthMm", { lengthMm: "" }, "纸箱长度不能为空"],
    ["widthMm", { widthMm: "" }, "纸箱宽度不能为空"],
    ["heightMm", { heightMm: "" }, "纸箱高度不能为空"],
    ["structureType", { structureType: "" }, "纸箱结构类型不能为空"],
    ["formingMethod", { formingMethod: "" }, "成箱方式不能为空"],
    ["productType", { productType: "" }, "产品类型不能为空"],
    ["arrangement", { arrangement: "" }, "内装物排列方式不能为空"],
    ["productionQuantity", { productionQuantity: "" }, "生产数量不能为空"],
  ] satisfies Array<[string, Partial<BoxSpecInput>, string]>)(
    "returns a field error when %s is empty",
    (field, overrides, message) => {
      expectFieldError(createValidInput(overrides), field, message);
    },
  );

  it.each([
    [{ lengthMm: 99 }, "lengthMm", "纸箱长度允许范围为 100-2000mm"],
    [{ lengthMm: 2001 }, "lengthMm", "纸箱长度允许范围为 100-2000mm"],
    [{ widthMm: 99 }, "widthMm", "纸箱宽度允许范围为 100-1500mm"],
    [{ widthMm: 1501 }, "widthMm", "纸箱宽度允许范围为 100-1500mm"],
    [{ heightMm: 99 }, "heightMm", "纸箱高度允许范围为 100-1500mm"],
    [{ heightMm: 1501 }, "heightMm", "纸箱高度允许范围为 100-1500mm"],
    [{ productWeightKg: 0.4 }, "productWeightKg", "内装物重量允许范围为 0.5-100kg"],
    [{ productWeightKg: 100.1 }, "productWeightKg", "内装物重量允许范围为 0.5-100kg"],
  ] satisfies Array<[Partial<BoxSpecInput>, string, string]>)(
    "returns a range error for %o",
    (overrides, field, message) => {
      expectFieldError(createValidInput(overrides), field, message);
    },
  );

  it.each([0, -1])("rejects production quantity %s", (productionQuantity) => {
    expectFieldError(
      createValidInput({ productionQuantity }),
      "productionQuantity",
      "生产数量必须大于 0",
    );
  });

  it("rejects non-integer production quantity", () => {
    expectFieldError(
      createValidInput({ productionQuantity: 10.5 }),
      "productionQuantity",
      "生产数量必须为整数",
    );
  });

  it("does not return a stacking layers error when stacking layers are omitted", () => {
    const normalizedInput = expectValid(createValidInput({ stackingLayers: undefined }));

    expect(normalizedInput.stackingRequirement.status).toBe("not_required");
  });

  it.each([0, 31])("rejects stacking layers %s outside allowed range", (stackingLayers) => {
    expectFieldError(
      createValidInput({ stackingLayers }),
      "stackingLayers",
      "堆码层数允许范围为 1-30 层",
    );
  });

  it("rejects non-integer stacking layers", () => {
    expectFieldError(
      createValidInput({ stackingLayers: 3.5 }),
      "stackingLayers",
      "堆码层数必须为整数",
    );
  });

  it("rejects length smaller than width", () => {
    expectFieldError(
      createValidInput({ lengthMm: 300, widthMm: 500 }),
      "lengthMm",
      "纸箱长度必须大于或等于宽度",
    );
  });

  it("rejects length width ratio greater than 5.0", () => {
    expectFieldError(
      createValidInput({ lengthMm: 501, widthMm: 100 }),
      "widthMm",
      "纸箱长宽比例必须在 1.0-5.0 之间",
    );
  });

  it("accepts length width ratio boundary 5.0", () => {
    const normalizedInput = expectValid(createValidInput({ lengthMm: 500, widthMm: 100 }));

    expect(normalizedInput).toMatchObject({
      lengthMm: 500,
      widthMm: 100,
    });
  });

  it("trims text fields and preserves optional special requirements", () => {
    const normalizedInput = expectValid(
      createValidInput({
        structureType: " 0201 ",
        productType: " 食品 ",
        specialRequirements: " 防潮 ",
      }),
    );

    expect(normalizedInput).toMatchObject({
      structureType: "0201",
      productType: "食品",
      specialRequirements: "防潮",
    });
  });

  it("does not include stacking height fields in normalized output", () => {
    const normalizedInput = expectValid(createValidInput());

    expect("stackingHeight" in normalizedInput).toBe(false);
    expect("stackingTotalHeight" in normalizedInput).toBe(false);
  });
});
