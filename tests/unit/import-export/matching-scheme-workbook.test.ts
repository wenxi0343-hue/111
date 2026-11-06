import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { buildMatchingSchemeWorkbook } from "@/modules/import-export/build-matching-scheme-workbook";
import type { MatchingSchemeHistoryRecord } from "@/server/actions/matching-scheme-history";

async function loadWorkbook(buffer: Buffer): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

function getWorksheetText(workbook: Workbook, sheetName: string): string {
  const worksheet = workbook.getWorksheet(sheetName);
  const values: string[] = [];

  expect(worksheet, `expected worksheet ${sheetName}`).toBeDefined();
  worksheet?.eachRow((row) => {
    row.eachCell((cell) => {
      values.push(String(cell.value ?? ""));
    });
  });

  return values.join("\n");
}

function createHistoryRecord(): MatchingSchemeHistoryRecord {
  const finalSchemeSnapshot = {
    status: "eligible",
    finalStatus: "qualified",
    warningMessages: [],
    selectionReason: {
      source: "ai",
      sourceLabel: "AI 生成",
      text: "保存时的最终选型理由",
      generatedAt: "2026-07-03T08:00:00.000Z",
    },
    candidate: {
      id: "final-scheme",
      layerCount: 3,
      fluteType: "B",
      layers: [
        {
          role: "outer_liner",
          paper: {
            id: "outer-paper",
            paperCode: "P1",
            name: "A级面纸",
            gramWeightGsm: 200,
          },
        },
        {
          role: "corrugating",
          flute: "B",
          paper: {
            id: "corrugating-paper",
            paperCode: "W1",
            name: "B楞瓦纸",
            gramWeightGsm: 160,
          },
        },
        {
          role: "inner_liner",
          paper: {
            id: "inner-paper",
            paperCode: "P2",
            name: "里纸",
            gramWeightGsm: 200,
          },
        },
      ],
    },
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: {
      burstStrength: 3800,
      edgeCrushKnPerM: 4.5,
      bctN: 520,
      isQualified: true,
      reasons: [],
    },
  };

  return {
    id: "scheme-1",
    createdAt: new Date("2026-07-03T08:00:00.000Z"),
    boxSpecSnapshot: {
      lengthMm: 500,
      widthMm: 300,
      heightMm: 250,
      productionQuantity: 1000,
    },
    originalRecommendationSlotsSnapshot: [
      {
        strategy: "economy",
        title: "经济型",
        status: "recommended",
        evaluation: finalSchemeSnapshot,
        selectionReason: {
          source: "template",
          sourceLabel: "模板生成",
          text: "经济型原始选型理由",
          generatedAt: "2026-07-03T08:00:00.000Z",
        },
      },
    ],
    finalSchemeSnapshot,
    priceSnapshot: [],
    parameterVersion: "prd-v1-default",
    isManuallyAdjusted: false,
    exportRecords: [],
    confirmedBy: "operator",
  };
}

describe("matching scheme workbook", () => {
  it("exports saved structured selection reasons", async () => {
    const result = await buildMatchingSchemeWorkbook({
      record: createHistoryRecord(),
      exportedAt: new Date("2026-07-03T09:20:00.000Z"),
    });
    const workbook = await loadWorkbook(result.buffer);
    const originalText = getWorksheetText(workbook, "原始三套推荐");
    const finalText = getWorksheetText(workbook, "最终确认方案");

    expect(originalText).toContain("模板生成：经济型原始选型理由");
    expect(finalText).toContain("AI 生成：保存时的最终选型理由");
  });
});
