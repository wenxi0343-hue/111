import { describe, expect, it } from "vitest";

import {
  matchPaperCode,
  matchPaperCodeExactly,
  matchPaperCodes,
  summarizePaperCodeMatches,
} from "@/modules/paper-code/match-paper-code";

interface TestPaperMaterial {
  id: string;
  paperCode: string;
  name?: string;
}

function createMaterial(overrides: Partial<TestPaperMaterial> = {}): TestPaperMaterial {
  return {
    id: "paper-1",
    paperCode: "r2",
    name: "测试原纸",
    ...overrides,
  };
}

describe("matchPaperCode", () => {
  it("matches a paper material by exact case-sensitive paper code", () => {
    const result = matchPaperCode({
      paperCode: "r2",
      candidates: [createMaterial({ id: "paper-1", paperCode: "r2" })],
    });

    expect(result).toMatchObject({
      status: "matched",
      material: { id: "paper-1" },
    });
  });

  it("does not match another candidate with different case when exact candidate exists", () => {
    const result = matchPaperCode({
      paperCode: "dC",
      candidates: [
        createMaterial({ id: "paper-lower-upper", paperCode: "dC" }),
        createMaterial({ id: "paper-upper", paperCode: "DC" }),
      ],
    });

    expect(result).toMatchObject({
      status: "matched",
      material: { id: "paper-lower-upper", paperCode: "dC" },
    });
  });

  it("matches special historical paper codes without changing the input text", () => {
    const result = matchPaperCode({
      paperCode: "aδ",
      candidates: [createMaterial({ id: "paper-special", paperCode: "aδ" })],
    });

    expect(result).toMatchObject({
      status: "matched",
      input: "aδ",
      normalizedInput: "aδ",
      material: { id: "paper-special" },
    });
  });

  it("trims surrounding whitespace while preserving the original input", () => {
    const result = matchPaperCode({
      paperCode: " r2 ",
      candidates: [createMaterial({ id: "paper-1", paperCode: "r2" })],
    });

    expect(result).toMatchObject({
      status: "matched",
      input: " r2 ",
      normalizedInput: "r2",
      material: { id: "paper-1" },
    });
  });

  it("returns one case mismatch candidate without treating it as matched", () => {
    const result = matchPaperCode({
      paperCode: "dc",
      candidates: [createMaterial({ id: "paper-upper", paperCode: "DC" })],
    });

    expect(result).toMatchObject({
      status: "case_mismatch",
      candidates: [{ id: "paper-upper", paperCode: "DC" }],
    });
  });

  it("returns multiple case candidates as ambiguous instead of choosing one", () => {
    const result = matchPaperCode({
      paperCode: "dc",
      candidates: [
        createMaterial({ id: "paper-lower-upper", paperCode: "dC" }),
        createMaterial({ id: "paper-upper", paperCode: "DC" }),
      ],
    });

    expect(result).toMatchObject({
      status: "ambiguous_case",
      candidates: [
        { id: "paper-lower-upper", paperCode: "dC" },
        { id: "paper-upper", paperCode: "DC" },
      ],
    });
  });

  it.each(["250g", "250G", "250"])(
    "returns suspected gram weight when %s has no exact or case candidate",
    (paperCode) => {
      const result = matchPaperCode({
        paperCode,
        candidates: [createMaterial({ id: "paper-1", paperCode: "r2" })],
      });

      expect(result).toMatchObject({
        status: "suspected_gram_weight",
      });

      if (result.status !== "suspected_gram_weight") {
        throw new Error("Expected suspected gram weight result");
      }

      expect(result.message).toContain("疑似克重");
    },
  );

  it("matches a real paper code before checking suspected gram weight", () => {
    const result = matchPaperCode({
      paperCode: "250",
      candidates: [createMaterial({ id: "paper-250", paperCode: "250" })],
    });

    expect(result).toMatchObject({
      status: "matched",
      material: { id: "paper-250" },
    });
  });

  it.each(["", "   ", undefined])("returns empty status for empty input %s", (paperCode) => {
    const result = matchPaperCode({
      paperCode,
      candidates: [createMaterial()],
    });

    expect(result).toMatchObject({
      status: "empty",
      normalizedInput: "",
    });
  });

  it("returns unmatched when there is no exact match or case candidate", () => {
    const result = matchPaperCode({
      paperCode: "unknown",
      candidates: [createMaterial()],
    });

    expect(result).toMatchObject({
      status: "unmatched",
      input: "unknown",
      normalizedInput: "unknown",
    });
  });
});

describe("matchPaperCodeExactly", () => {
  it("returns a candidate for exact paper code matches", () => {
    const result = matchPaperCodeExactly("r2", [createMaterial({ paperCode: "r2" })]);

    expect(result).toMatchObject({ paperCode: "r2" });
  });

  it("does not ignore case for exact paper code matches", () => {
    const result = matchPaperCodeExactly("R2", [createMaterial({ paperCode: "r2" })]);

    expect(result).toBeUndefined();
  });

  it("does not treat case mismatch candidates as successful exact matches", () => {
    const result = matchPaperCodeExactly("dc", [createMaterial({ paperCode: "DC" })]);

    expect(result).toBeUndefined();
  });
});

describe("matchPaperCodes", () => {
  it("returns ordered rows and summary for mixed paper code inputs", () => {
    const candidates = [
      createMaterial({ id: "paper-r2", paperCode: "r2" }),
      createMaterial({ id: "paper-upper", paperCode: "DC" }),
      createMaterial({ id: "paper-lower-upper", paperCode: "dC" }),
      createMaterial({ id: "paper-special", paperCode: "aδ" }),
    ];

    const result = matchPaperCodes({
      paperCodes: ["r2", "aδ", "dc", "250g", "", "unknown"],
      candidates,
    });

    expect(result.rows).toHaveLength(6);
    expect(result.rows.map((row) => row.input)).toEqual(["r2", "aδ", "dc", "250g", "", "unknown"]);
    expect(result.rows.map((row) => row.status)).toEqual([
      "matched",
      "matched",
      "ambiguous_case",
      "suspected_gram_weight",
      "empty",
      "unmatched",
    ]);
    expect(result.rows[2]).toMatchObject({
      status: "ambiguous_case",
      candidates: [
        { id: "paper-upper", paperCode: "DC" },
        { id: "paper-lower-upper", paperCode: "dC" },
      ],
    });
    expect(result.summary).toEqual({
      matchedCount: 2,
      confirmationRequiredCount: 1,
      failedCount: 3,
      suspectedGramWeightCount: 1,
      emptyCount: 1,
      unmatchedCount: 1,
    });
  });
});

describe("summarizePaperCodeMatches", () => {
  it("returns the same summary as batch matching for the same rows", () => {
    const batchResult = matchPaperCodes({
      paperCodes: ["r2", "aδ", "dc", "250g", "", "unknown"],
      candidates: [
        createMaterial({ id: "paper-r2", paperCode: "r2" }),
        createMaterial({ id: "paper-upper", paperCode: "DC" }),
        createMaterial({ id: "paper-lower-upper", paperCode: "dC" }),
        createMaterial({ id: "paper-special", paperCode: "aδ" }),
      ],
    });

    expect(summarizePaperCodeMatches(batchResult.rows)).toEqual(batchResult.summary);
  });
});
