import { validateBoxSpecInput } from "@/modules/box-spec/validate-box-spec";
import type { BoxSpecFieldError } from "@/modules/box-spec/types";
import {
  EXPECTED_TEST_ITEMS,
  REQUESTED_LAYER_COUNTS,
  type CreateReviewOrderInput,
  type CreateReviewOrderValidationResult,
  type NormalizedCreateReviewOrderInput,
  type ReviewOrderFieldError,
} from "./types";

function normalizeText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

export function validateCreateReviewOrder(
  input: CreateReviewOrderInput,
): CreateReviewOrderValidationResult {
  const fieldErrors: ReviewOrderFieldError[] = [];

  const customerName = normalizeText(input.customerName);

  if (!customerName) {
    fieldErrors.push({ field: "customerName", message: "客户名称不能为空" });
  }

  const productName = normalizeText(input.productName);

  if (!productName) {
    fieldErrors.push({ field: "productName", message: "产品名称不能为空" });
  }

  const hasSample = input.hasSample === true;

  let expectedTestItems: string[] = [];

  if (hasSample) {
    const rawItems = Array.isArray(input.expectedTestItems) ? input.expectedTestItems : [];
    const validItems: string[] = [];
    let hasInvalid = false;

    for (const item of rawItems) {
      if (typeof item === "string" && (EXPECTED_TEST_ITEMS as readonly string[]).includes(item)) {
        validItems.push(item);
      } else {
        hasInvalid = true;
      }
    }

    if (validItems.length === 0) {
      fieldErrors.push({
        field: "expectedTestItems",
        message: "有样品时必须至少选择一项期望检测项",
      });
    }

    if (hasInvalid) {
      fieldErrors.push({
        field: "expectedTestItems",
        message: "存在不支持的检测项，请从预设列表中选择",
      });
    }

    expectedTestItems = validItems;
  }

  let requestedLayerCount: number | undefined;

  if (input.requestedLayerCount !== undefined && input.requestedLayerCount !== "" && input.requestedLayerCount !== null) {
    const parsed = Number(input.requestedLayerCount);

    if (!Number.isInteger(parsed) || !(REQUESTED_LAYER_COUNTS as readonly number[]).includes(parsed)) {
      fieldErrors.push({ field: "requestedLayerCount", message: "纸箱层数意向仅支持 3、5、7 层" });
    } else {
      requestedLayerCount = parsed;
    }
  }

  const boxValidation = validateBoxSpecInput(input.boxSpec ?? ({} as CreateReviewOrderInput["boxSpec"]));

  if (!boxValidation.ok) {
    for (const boxError of boxValidation.error.fieldErrors) {
      fieldErrors.push({
        field: `boxSpec.${boxError.field}`,
        message: boxError.message,
      } satisfies ReviewOrderFieldError);
    }
  }

  if (fieldErrors.length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请检查评审工单录入",
        fieldErrors,
      },
    };
  }

  const okBoxValidation = boxValidation as Extract<typeof boxValidation, { ok: true }>;

  const normalized: NormalizedCreateReviewOrderInput = {
    customerName: customerName as string,
    productName: productName as string,
    boxSpec: okBoxValidation.data,
    requestedLayerCount,
    hasSample,
    sampleNotes: normalizeText(input.sampleNotes),
    expectedTestItems,
    printingRequirements: normalizeText(input.printingRequirements),
    physicalRequirements: normalizeText(input.physicalRequirements),
  };

  return { ok: true, data: normalized };
}

export type { BoxSpecFieldError };
