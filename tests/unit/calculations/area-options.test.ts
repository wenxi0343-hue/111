import { describe, expect, it } from "vitest";
import { calculateAreaOptions } from "@/modules/calculations/area-options";

describe("calculateAreaOptions", () => {
  it("calculates a separate area for each flute of the chosen layer", () => {
    const input = {
      lengthMm: "500",
      widthMm: "300",
      heightMm: "250",
      dimensionType: "inner" as const,
      formingMethod: "glue" as const,
    };
    const three = calculateAreaOptions({ ...input, layerCount: 3 });
    expect(three.ok && three.results.map((item) => item.fluteType)).toEqual(["A", "C", "B", "E"]);
    const five = calculateAreaOptions({ ...input, layerCount: 5 });
    expect(five.ok && five.results.map((item) => item.fluteType)).toEqual(["BC", "BA", "AC", "BE"]);
    expect(five.ok && five.results[3]?.areaSquareMeters).toBeCloseTo(0.937862, 6);
    const seven = calculateAreaOptions({ ...input, layerCount: 7 });
    expect(seven.ok && seven.results[0]?.areaSquareMeters).toBeCloseTo(0.964275, 6);
  });

  it("converts external measurements using the selected layer once", () => {
    for (const [layerCount, offset] of [
      [3, 8],
      [5, 10],
      [7, 14],
    ] as const) {
      const base = {
        lengthMm: "500",
        widthMm: "300",
        heightMm: "250",
        formingMethod: "glue" as const,
        layerCount,
      };
      const inner = calculateAreaOptions({ ...base, dimensionType: "inner" });
      const outer = calculateAreaOptions({
        ...base,
        lengthMm: String(500 + offset),
        widthMm: String(300 + offset),
        heightMm: String(250 + offset),
        dimensionType: "outer",
      });
      expect(outer).toEqual(inner);
    }
  });

  it("rejects missing, non-integer and out-of-range inner sizes", () => {
    const base = {
      lengthMm: "500",
      widthMm: "300",
      heightMm: "250",
      dimensionType: "inner" as const,
      formingMethod: "glue" as const,
      layerCount: 3 as const,
    };
    for (const lengthMm of ["", "abc", "500.5", "99"])
      expect(calculateAreaOptions({ ...base, lengthMm }).ok).toBe(false);
    expect(calculateAreaOptions({ ...base, lengthMm: "200", widthMm: "300" }).ok).toBe(false);
  });
});
