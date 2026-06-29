import { describe, expect, it } from "vitest";

import { APP_NAME } from "@/shared/constants/app";

describe("project scaffold", () => {
  it("exposes the configured application name", () => {
    expect(APP_NAME).toBe("纸箱自动配纸工具");
  });
});
