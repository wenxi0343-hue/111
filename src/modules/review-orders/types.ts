import type { BoxSpecInput, NormalizedBoxSpec } from "@/modules/box-spec/types";

export type ReviewOrderStatus = "pending_process_review" | "pending_finance_review" | "quoted";

export const REVIEW_ORDER_STATUS_LABELS: Record<ReviewOrderStatus, string> = {
  pending_process_review: "待工艺评审",
  pending_finance_review: "待财务核算",
  quoted: "已报价",
};

export const EXPECTED_TEST_ITEMS = ["尺寸", "配纸", "物理指标", "印刷", "其他"] as const;
export type ExpectedTestItem = (typeof EXPECTED_TEST_ITEMS)[number];

export const REQUESTED_LAYER_COUNTS = [3, 5, 7] as const;

export interface CreateReviewOrderInput {
  customerName: string | undefined;
  productName: string | undefined;
  boxSpec: BoxSpecInput;
  requestedLayerCount?: number | string | undefined;
  hasSample: boolean | undefined;
  sampleNotes?: string | undefined;
  expectedTestItems?: string[] | undefined;
  printingRequirements?: string | undefined;
  physicalRequirements?: string | undefined;
}

export interface NormalizedCreateReviewOrderInput {
  customerName: string;
  productName: string;
  boxSpec: NormalizedBoxSpec;
  requestedLayerCount: number | undefined;
  hasSample: boolean;
  sampleNotes: string | undefined;
  expectedTestItems: string[];
  printingRequirements: string | undefined;
  physicalRequirements: string | undefined;
}

export interface ReviewOrderFieldError {
  field: string;
  message: string;
}

export type CreateReviewOrderValidationResult =
  | { ok: true; data: NormalizedCreateReviewOrderInput }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR";
        message: string;
        fieldErrors: ReviewOrderFieldError[];
      };
    };
