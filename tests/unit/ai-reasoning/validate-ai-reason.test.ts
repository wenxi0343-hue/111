import { describe, expect, it } from "vitest";

import { validateAiSelectionReason } from "@/modules/ai-reasoning/validate-ai-reason";
import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";

function createFacts(overrides: Partial<SelectionReasonFacts> = {}): SelectionReasonFacts {
  return {
    strategy: "economy",
    strategyLabel: "经济型",
    isOfficialRecommendation: true,
    finalStatus: "qualified",
    layerCount: 3,
    fluteType: "B",
    paperSummary: ["K200", "W160", "K200"],
    cost: { taxIncludedCostYuan: 2.35 },
    strength: {
      bctN: 900,
      edgeCrushKnPerM: 4.12,
      burstStrength: 780,
    },
    riskMessages: [],
    statusMessages: [],
    ...overrides,
  };
}

describe("validateAiSelectionReason", () => {
  it("accepts a qualified and manufacturable reason that matches the facts", () => {
    const result = validateAiSelectionReason({
      facts: createFacts(),
      text: "该经济型方案成本较低，强度满足要求，可生产。",
    });

    expect(result.isValid).toBe(true);
  });

  it("rejects unqualified reasons that describe the scheme as qualified", () => {
    const result = validateAiSelectionReason({
      facts: createFacts({
        finalStatus: "unqualified",
        riskMessages: ["边压不足"],
      }),
      text: "该方案已达标，强度满足要求。",
    });

    expect(result.isValid).toBe(false);
    expect(result.reason).toBe("validation_failed");
  });

  it("rejects not-manufacturable reasons that describe the scheme as manufacturable", () => {
    const result = validateAiSelectionReason({
      facts: createFacts({
        finalStatus: "not_manufacturable",
        riskMessages: ["超过设备最大宽度"],
      }),
      text: "该方案可生产，满足设备限制。",
    });

    expect(result.isValid).toBe(false);
  });

  it("rejects incomplete-data reasons that describe the result as complete", () => {
    const result = validateAiSelectionReason({
      facts: createFacts({
        finalStatus: "data_incomplete",
        cost: undefined,
        riskMessages: ["缺少原纸价格"],
      }),
      text: "该方案数据完整，结果可靠。",
    });

    expect(result.isValid).toBe(false);
  });

  it("rejects reference reasons that describe the scheme as an official recommendation", () => {
    const result = validateAiSelectionReason({
      facts: createFacts({
        isOfficialRecommendation: false,
        riskMessages: ["当前仅供调整参考"],
      }),
      text: "这是正式推荐方案，可以直接作为推荐达标方案。",
    });

    expect(result.isValid).toBe(false);
  });
});
