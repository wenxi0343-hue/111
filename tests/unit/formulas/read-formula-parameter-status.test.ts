import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FORMULA_PARAMETERS_READY_METADATA_KEY,
  hasActiveFormulaParametersFromRepository,
  type FormulaParameterStatusRepository,
} from "@/modules/formulas/read-formula-parameter-status";

describe("formula parameter status reader", () => {
  it("reports active formula parameters through a read-only repository contract", async () => {
    const hasActiveFormulaParameters = vi.fn(async () => true);
    const repository: FormulaParameterStatusRepository = {
      hasActiveFormulaParameters,
    };

    await expect(hasActiveFormulaParametersFromRepository({ repository })).resolves.toBe(true);
    expect(hasActiveFormulaParameters).toHaveBeenCalledOnce();
  });

  it("uses a stable system metadata key for current formula parameters", () => {
    expect(FORMULA_PARAMETERS_READY_METADATA_KEY).toBe("formula_parameters_ready");
  });

  it("does not introduce formula editing or calculation behavior", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "modules", "formulas", "read-formula-parameter-status.ts"),
      "utf8",
    );

    expect(source).not.toContain(".insert(");
    expect(source).not.toContain(".update(");
    expect(source).not.toContain(".delete(");
    expect(source).not.toContain("calculate");
  });
});
