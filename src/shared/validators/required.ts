import type { ActionResult } from "@/shared/types/action-result";

export function requireValue<T>(value: T | null | undefined, fieldName: string): ActionResult<T> {
  if (value === null || value === undefined || value === "") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `${fieldName}不能为空`,
      },
    };
  }

  return { ok: true, data: value };
}
