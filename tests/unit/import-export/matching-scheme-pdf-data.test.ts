import { describe, expect, it } from "vitest";

import { buildMatchingSchemePdfData } from "@/modules/import-export/build-matching-scheme-pdf-data";
import type { MatchingSchemePdfData } from "@/modules/import-export/matching-scheme-pdf-types";
import { renderMatchingSchemePdfHtml } from "@/modules/import-export/render-matching-scheme-pdf-html";
import type { MatchingSchemeHistoryRecord } from "@/server/actions/matching-scheme-history";

type RecommendationSlotSnapshot = Record<string, unknown> & { title?: string };

function createHistoryRecord(): MatchingSchemeHistoryRecord {
  const finalSchemeSnapshot = {
    status: "eligible",
    finalStatus: "qualified",
    warningMessages: [],
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
            factoryName: "一号纸厂",
            name: "A级面纸",
            gramWeightGsm: 200,
            priceYuanPerTon: 3000,
            burstIndex: 10,
            ringCrushIndex: 20,
          },
        },
        {
          role: "corrugating",
          flute: "B",
          paper: {
            id: "corrugating-paper",
            paperCode: "W1",
            factoryName: "二号纸厂",
            name: "B楞瓦纸",
            gramWeightGsm: 160,
            priceYuanPerTon: 2800,
            burstIndex: 8,
            ringCrushIndex: 18,
          },
        },
        {
          role: "inner_liner",
          paper: {
            id: "inner-paper",
            paperCode: "P2",
            factoryName: "三号纸厂",
            name: "里纸",
            gramWeightGsm: 200,
            priceYuanPerTon: 3000,
            burstIndex: 10,
            ringCrushIndex: 20,
          },
        },
      ],
    },
    area: {
      areaSquareMeters: 0.8905,
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
    cost: {
      utilizationRate: 0.88,
      layerUnitPrices: [
        {
          role: "outer_liner",
          paperCode: "P1",
          unitPriceYuanPerSquareMeter: 0.51,
        },
      ],
      paperCostYuan: 1.2,
      processingFeeYuan: 0.9,
      taxYuan: 0.35,
      taxIncludedCostYuan: 2.45,
    },
  };

  return {
    id: "scheme-1",
    createdAt: new Date("2026-07-02T08:30:00.000Z"),
    boxSpecSnapshot: {
      lengthMm: 500,
      widthMm: 300,
      heightMm: 250,
      structureType: "0201",
      formingMethod: "glue",
      productType: "食品",
      productWeightKg: 10,
      arrangement: "single_row",
      productionQuantity: 1000,
      stackingRequirement: {
        status: "required",
        stackingLayers: 3,
        displayText: "需要堆码",
      },
    },
    originalRecommendationSlotsSnapshot: [
      {
        strategy: "economy",
        title: "经济型",
        status: "recommended",
        isOfficialRecommendation: true,
        evaluation: {
          ...finalSchemeSnapshot,
          cost: {
            ...finalSchemeSnapshot.cost,
            taxIncludedCostYuan: 2.13,
          },
        },
        messages: ["成本最低"],
        unavailableReasons: [],
      },
      {
        strategy: "safety",
        title: "安全型",
        status: "recommended",
        isOfficialRecommendation: true,
        evaluation: {
          ...finalSchemeSnapshot,
          cost: {
            ...finalSchemeSnapshot.cost,
            taxIncludedCostYuan: 2.68,
          },
        },
        messages: ["强度冗余更高"],
        unavailableReasons: [],
      },
      {
        strategy: "balanced",
        title: "均衡型",
        status: "recommended",
        isOfficialRecommendation: true,
        evaluation: {
          ...finalSchemeSnapshot,
          cost: {
            ...finalSchemeSnapshot.cost,
            taxIncludedCostYuan: 2.32,
          },
        },
        messages: ["成本与强度均衡"],
        unavailableReasons: [],
      },
    ],
    finalSchemeSnapshot,
    priceSnapshot: [],
    parameterVersion: "prd-v1-default",
    isManuallyAdjusted: true,
    exportRecords: [],
    confirmedBy: "operator",
  };
}

function createSelectionReason(sourceLabel: "AI 生成" | "模板生成", text: string) {
  return {
    source: sourceLabel === "AI 生成" ? "ai" : "template",
    sourceLabel,
    text,
    generatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function expectNoInternalCostLeak(data: MatchingSchemePdfData) {
  const serialized = JSON.stringify(data);

  expect(serialized).not.toContain("taxIncludedCostYuan");
  expect(serialized).not.toContain("layerUnitPrices");
  expect(serialized).not.toContain("paperCostYuan");
  expect(serialized).not.toContain("processingFeeYuan");
  expect(serialized).not.toContain("taxYuan");
}

function createHistoryRecordWithLongChineseFields(): {
  record: MatchingSchemeHistoryRecord;
  longPaperName: string;
  longReason: string;
} {
  const record = createHistoryRecord();
  const longPaperName = "超长耐破高环压牛卡纸适合冷链重货堆码运输场景".repeat(4);
  const longReason =
    "推荐该方案是因为它在目标抗压、边压、耐破和设备可生产能力之间保持稳定余量，同时纸张组合适合客户沟通和批量生产确认。".repeat(5);
  const finalSnapshot = record.finalSchemeSnapshot as {
    candidate: { layers: Array<{ paper: { name: string } }> };
  } & Record<string, unknown>;
  const firstLayer = finalSnapshot.candidate.layers[0];

  if (firstLayer) {
    firstLayer.paper.name = longPaperName;
  }

  finalSnapshot.recommendationReason = longReason;

  return { record, longPaperName, longReason };
}

describe("matching scheme PDF data", () => {
  it("builds full report data with original recommendations, strength and cost", () => {
    const data = buildMatchingSchemePdfData({
      record: createHistoryRecord(),
      type: "full_report",
    });

    expect(data).toMatchObject({
      type: "full_report",
      title: "配纸方案报告",
      exportVisibility: {
        showCost: true,
        showOriginalRecommendations: true,
      },
    });
    expect(data.fileName).toContain("配纸方案-20260702-083000-完整报告.pdf");
    expect(data.boxSpec["纸箱尺寸"]).toBe("500 x 300 x 250 mm");
    expect(data.originalRecommendations).toHaveLength(3);
    expect(data.finalScheme.configuration).toEqual(
      expect.arrayContaining([
        { label: "层数", value: "3 层" },
        { label: "瓦型", value: "B 楞" },
      ]),
    );
    expect(data.finalScheme.strength).toEqual(
      expect.arrayContaining([
        { label: "空箱抗压", value: "520 N" },
        { label: "边压", value: "4.50 kN/m" },
        { label: "耐破", value: "3800" },
      ]),
    );
    expect(data.finalScheme.cost).toEqual(
      expect.arrayContaining([{ label: "单箱含税成本", value: "2.45 元" }]),
    );
    expect(data.recommendationConclusion).toContain("达标且可生产");
  });

  it("renders full report HTML with cost and original recommendation sections", () => {
    const data = buildMatchingSchemePdfData({
      record: createHistoryRecord(),
      type: "full_report",
    });
    const html = renderMatchingSchemePdfHtml(data);

    expect(html).toContain("配纸方案报告");
    expect(html).toContain("原始三套推荐");
    expect(html).toContain("单箱含税成本");
    expect(html).toContain("强度校核");
    expect(html).toContain("overflow-wrap");
  });

  it("renders long Chinese paper names and explicit recommendation reason in full report HTML", () => {
    const { record, longPaperName, longReason } = createHistoryRecordWithLongChineseFields();
    const data = buildMatchingSchemePdfData({
      record,
      type: "full_report",
    });
    const html = renderMatchingSchemePdfHtml(data);

    expect(data.title).toBe("配纸方案报告");
    expect(data.recommendationConclusion).toBe(longReason);
    expect(html).toContain("配纸方案报告");
    expect(html).toContain(longPaperName);
    expect(html).toContain(longReason);
    expect(html).toContain("overflow-wrap: anywhere");
  });

  it("uses saved structured selection reasons for final and original recommendation conclusions", () => {
    const record = createHistoryRecord();
    record.finalSchemeSnapshot = {
      ...record.finalSchemeSnapshot,
      selectionReason: createSelectionReason("AI 生成", "保存时的理由"),
    };
    record.originalRecommendationSlotsSnapshot = (
      record.originalRecommendationSlotsSnapshot as RecommendationSlotSnapshot[]
    ).map((slot, index) => ({
        ...slot,
        selectionReason: createSelectionReason(
          index === 0 ? "AI 生成" : "模板生成",
          `${slot.title ?? "推荐方案"}保存理由`,
        ),
      }));

    const data = buildMatchingSchemePdfData({
      record,
      type: "full_report",
    });

    expect(data.recommendationConclusion).toContain("AI 生成");
    expect(data.recommendationConclusion).toContain("保存时的理由");
    expect(data.originalRecommendations[0]?.conclusion).toContain("AI 生成");
    expect(data.originalRecommendations[0]?.conclusion).toContain("经济型保存理由");
    expect(data.originalRecommendations[1]?.conclusion).toContain("模板生成");
    expect(data.originalRecommendations[1]?.conclusion).toContain("安全型保存理由");
  });

  it("keeps saved selection reason source visible in summary sheet data", () => {
    const record = createHistoryRecord();
    record.finalSchemeSnapshot = {
      ...record.finalSchemeSnapshot,
      selectionReason: createSelectionReason("AI 生成", "保存时的理由"),
    };

    const data = buildMatchingSchemePdfData({
      record,
      type: "summary_sheet",
    });

    expect(data.recommendationConclusion).toContain("AI 生成");
    expect(data.recommendationConclusion).toContain("保存时的理由");
    expect(data.originalRecommendations).toEqual([]);
  });

  it("fills old snapshots without selection reason using deterministic template text", () => {
    const data = buildMatchingSchemePdfData({
      record: createHistoryRecord(),
      type: "summary_sheet",
    });

    expect(data.recommendationConclusion).toContain("成本：该方案含税成本为 2.45 元");
    expect(data.recommendationConclusion).toContain("强度：空箱抗压 520 N");
    expect(data.recommendationConclusion).toContain("风险提示：当前未发现强度或设备风险");
    expect(JSON.stringify(data)).not.toContain("provider_failed");
    expect(JSON.stringify(data)).not.toContain("AI_PROVIDER");
  });

  it("builds summary sheet data without internal cost fields", () => {
    const data = buildMatchingSchemePdfData({
      record: createHistoryRecord(),
      type: "summary_sheet",
    });

    expect(data).toMatchObject({
      type: "summary_sheet",
      title: "配纸方案表",
      exportVisibility: {
        showCost: false,
        showOriginalRecommendations: false,
      },
    });
    expect(data.fileName).toContain("配纸方案-20260702-083000-精简方案表.pdf");
    expect(data.originalRecommendations).toEqual([]);
    expect(data.finalScheme.cost).toEqual([]);
    expect(data.finalScheme.strength).toEqual(
      expect.arrayContaining([
        { label: "空箱抗压", value: "520 N" },
        { label: "达标状态", value: "达标" },
        { label: "可生产状态", value: "可生产" },
      ]),
    );
    expectNoInternalCostLeak(data);
  });

  it("renders summary sheet HTML without cost wording", () => {
    const data = buildMatchingSchemePdfData({
      record: createHistoryRecord(),
      type: "summary_sheet",
    });
    const html = renderMatchingSchemePdfHtml(data);

    expect(html).toContain("配纸方案表");
    expect(html).toContain("方案配置");
    expect(html).toContain("推荐结论");
    expect(html).not.toContain("单箱含税成本");
    expect(html).not.toContain("各层单价");
    expect(html).not.toContain("用纸总价");
    expect(html).not.toContain("加工费用");
    expect(html).not.toContain("税金");
  });

  it("renders summary sheet with long Chinese fields and no cost leak", () => {
    const { record, longPaperName, longReason } = createHistoryRecordWithLongChineseFields();
    const data = buildMatchingSchemePdfData({
      record,
      type: "summary_sheet",
    });
    const html = renderMatchingSchemePdfHtml(data);

    expect(data.title).toBe("配纸方案表");
    expect(data.recommendationConclusion).toBe(longReason);
    expect(html).toContain("配纸方案表");
    expect(html).toContain("最终确认方案");
    expect(html).toContain("方案配置");
    expect(html).toContain("强度校核");
    expect(html).toContain(longPaperName);
    expect(html).toContain(longReason);
    expectNoInternalCostLeak(data);
    expect(html).not.toContain("单箱含税成本");
    expect(html).not.toContain("各层单价");
    expect(html).not.toContain("用纸总价");
    expect(html).not.toContain("加工费用");
    expect(html).not.toContain("税金");
  });
});
