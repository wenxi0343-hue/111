import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALCULATION_PARAMETERS,
  REJECTION_REASON_TYPES,
} from "@/modules/calculations/default-parameters";

describe("default calculation parameters", () => {
  it("exposes fixed device limits from the PRD", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.deviceLimits.boardMachine).toEqual({
      maxLengthMm: 1800,
      maxWidthMm: 1710,
      minLengthMm: 500,
      minWidthMm: 360,
    });

    expect(DEFAULT_CALCULATION_PARAMETERS.deviceLimits.printerSlotter).toMatchObject({
      maxFeedLengthMm: 2400,
      maxFeedWidthMm: 1580,
      allowFeedRotation: false,
    });
  });

  it("exposes fixed corrugation take-up factors from the PRD", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.corrugationTakeUpFactors).toEqual({
      A: 1.49,
      B: 1.33,
      C: 1.431,
      E: 1.329,
    });
  });

  it("keeps the edge crush correction factor neutral when the PRD does not provide a value", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.edgeCrushCorrectionFactor).toBe(1);
  });

  it("exposes fixed board thickness values from the PRD", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.boardThicknessMm).toEqual({
      A: 4.5,
      B: 2.5,
      C: 3.7,
      E: 1.1,
      BC: 6.2,
      BA: 7.0,
      BE: 3.6,
      AC: 8.2,
      BAC: 10.7,
    });
  });

  it("exposes fixed strength thresholds by layer count", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.strengthThresholds).toEqual({
      3: { minBctN: 400, minEdgeCrushKnPerM: 4.0 },
      5: { minBctN: 800, minEdgeCrushKnPerM: 7.0 },
      7: { minBctN: 1200, minEdgeCrushKnPerM: 10.0 },
    });
  });

  it("exposes burst strength thresholds used for burst unqualified reasons", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.burstStrengthThresholdsByLayerCount).toEqual({
      3: 100,
      5: 200,
      7: 300,
    });
  });

  it("exposes fixed processing fee factors by layer count", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.processingFeeFactorsByLayerCount).toEqual({
      3: 1.1,
      5: 1.36,
      7: 2.12,
    });
  });

  it("keeps pad fee explicit and defaulted to zero", () => {
    expect(DEFAULT_CALCULATION_PARAMETERS.padFeeYuan).toBe(0);
  });

  it("exposes only the approved rejection reason types", () => {
    expect(REJECTION_REASON_TYPES).toEqual([
      "DATA_MISSING",
      "PARAMETER_ERROR",
      "NOT_MANUFACTURABLE",
      "STRENGTH_UNQUALIFIED",
    ]);
  });

  it("keeps calculation modules independent from app, server, database, and AI layers", () => {
    const calculationsRoot = join(process.cwd(), "src", "modules", "calculations");
    const forbiddenImports = ["@/db", "@/server", "@/app", "ai-reasoning"];

    function collectSourceFiles(dir: string): string[] {
      return readdirSync(dir).flatMap((entry) => {
        const fullPath = join(dir, entry);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          return collectSourceFiles(fullPath);
        }

        return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
      });
    }

    const source = collectSourceFiles(calculationsRoot)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const forbiddenImport of forbiddenImports) {
      expect(source).not.toContain(forbiddenImport);
    }
  });
});
