import { describe, expect, it } from "vitest";

import {
  createSelectionReason,
  type AiReasoningProvider,
} from "@/modules/ai-reasoning/generate-selection-reason";
import {
  createAiReasoningCacheKey,
  createInMemoryAiReasoningRepository,
} from "@/modules/ai-reasoning/cache";
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

function createProvider(
  generateSelectionReason: AiReasoningProvider["generateSelectionReason"],
): AiReasoningProvider {
  return { generateSelectionReason };
}

describe("createSelectionReason", () => {
  it("returns an AI generated reason when the provider succeeds and the text matches facts", async () => {
    const reason = await createSelectionReason({
      facts: createFacts(),
      provider: createProvider(async () => ({
        text: "该经济型方案成本较低，强度满足要求，可生产。",
      })),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(reason.source).toBe("ai");
    expect(reason.sourceLabel).toBe("AI 生成");
    expect(reason.text).toBe("该经济型方案成本较低，强度满足要求，可生产。");
    expect(reason.generatedAt).toBe("2026-07-04T00:00:00.000Z");
    expect(reason.fallbackReason).toBeUndefined();
  });

  it("falls back to template when no provider is configured", async () => {
    const reason = await createSelectionReason({
      facts: createFacts(),
    });

    expect(reason.source).toBe("template");
    expect(reason.sourceLabel).toBe("模板生成");
    expect(reason.fallbackReason).toBe("provider_not_configured");
  });

  it("falls back to template when the provider throws", async () => {
    const reason = await createSelectionReason({
      facts: createFacts(),
      provider: createProvider(async () => {
        throw new Error("provider failed");
      }),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("provider_failed");
  });

  it("falls back to template when the provider times out", async () => {
    const reason = await createSelectionReason({
      facts: createFacts(),
      provider: createProvider(
        () => new Promise(() => {
          // Intentionally unresolved to exercise timeout fallback.
        }),
      ),
      options: { timeoutMs: 10 },
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("provider_timeout");
  });

  it("falls back to template when AI text conflicts with unqualified facts", async () => {
    const reason = await createSelectionReason({
      facts: createFacts({
        finalStatus: "unqualified",
        riskMessages: ["边压不足"],
      }),
      provider: createProvider(async () => ({
        text: "该方案已达标，强度满足要求。",
      })),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("validation_failed");
    expect(reason.text).toContain("成本");
    expect(reason.text).toContain("强度");
    expect(reason.text).toContain("可生产状态");
    expect(reason.text).toContain("风险提示");
    expect(reason.text).toContain("边压不足");
  });

  it("falls back to template when AI text conflicts with not-manufacturable facts", async () => {
    const reason = await createSelectionReason({
      facts: createFacts({
        finalStatus: "not_manufacturable",
        riskMessages: ["超过设备最大宽度"],
      }),
      provider: createProvider(async () => ({
        text: "该方案可生产，满足设备限制。",
      })),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("validation_failed");
  });

  it("falls back to template when AI text conflicts with incomplete data facts", async () => {
    const reason = await createSelectionReason({
      facts: createFacts({
        finalStatus: "data_incomplete",
        cost: undefined,
        riskMessages: ["缺少原纸价格"],
      }),
      provider: createProvider(async () => ({
        text: "该方案数据完整，结果可靠。",
      })),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("validation_failed");
  });

  it("falls back to template when AI text describes a reference scheme as official", async () => {
    const reason = await createSelectionReason({
      facts: createFacts({
        isOfficialRecommendation: false,
        riskMessages: ["当前仅供调整参考"],
      }),
      provider: createProvider(async () => ({
        text: "这是正式推荐方案，可以作为推荐达标方案。",
      })),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("validation_failed");
  });

  it("returns cached AI reason without calling provider or increasing daily usage", async () => {
    const facts = createFacts();
    const cacheKey = createAiReasoningCacheKey(facts);
    const repository = createInMemoryAiReasoningRepository({
      dailyUsages: {
        "2026-07-04": 9,
      },
    });

    await repository.saveCachedReason({
      cacheKey,
      reasonText: "缓存中的 AI 理由",
      modelName: "fake-model",
      factsSnapshot: facts,
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      expiresAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    const reason = await createSelectionReason({
      facts,
      repository,
      provider: createProvider(async () => {
        throw new Error("provider should not be called");
      }),
      now: new Date("2026-07-04T10:00:00.000Z"),
    });

    expect(reason.source).toBe("ai");
    expect(reason.sourceLabel).toBe("AI 生成");
    expect(reason.text).toBe("缓存中的 AI 理由");
    expect(repository.getDailyUsageCount("2026-07-04")).toBe(9);
  });

  it("falls back to template without calling provider when daily limit is reached", async () => {
    const repository = createInMemoryAiReasoningRepository({
      dailyUsages: {
        "2026-07-04": 100,
      },
    });

    const reason = await createSelectionReason({
      facts: createFacts(),
      repository,
      provider: createProvider(async () => {
        throw new Error("provider should not be called");
      }),
      options: { dailyLimit: 100 },
      now: new Date("2026-07-04T10:00:00.000Z"),
    });

    expect(reason.source).toBe("template");
    expect(reason.fallbackReason).toBe("daily_limit_reached");
    expect(repository.getDailyUsageCount("2026-07-04")).toBe(100);
  });
});
