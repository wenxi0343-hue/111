import { describe, expect, it } from "vitest";

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

describe("createAiReasoningCacheKey", () => {
  it("returns the same key for the same facts", () => {
    expect(createAiReasoningCacheKey(createFacts())).toBe(
      createAiReasoningCacheKey(createFacts()),
    );
  });

  it("changes when tax-included cost changes", () => {
    expect(createAiReasoningCacheKey(createFacts())).not.toBe(
      createAiReasoningCacheKey(
        createFacts({
          cost: { taxIncludedCostYuan: 2.36 },
        }),
      ),
    );
  });

  it("changes when final status changes", () => {
    expect(createAiReasoningCacheKey(createFacts())).not.toBe(
      createAiReasoningCacheKey(
        createFacts({
          finalStatus: "unqualified",
          riskMessages: ["边压不足"],
        }),
      ),
    );
  });
});

describe("ai reasoning cache repository", () => {
  it("returns cached AI reason when the record is not expired", async () => {
    const repository = createInMemoryAiReasoningRepository();
    const facts = createFacts();
    const cacheKey = createAiReasoningCacheKey(facts);

    await repository.saveCachedReason({
      cacheKey,
      reasonText: "保存的 AI 理由",
      modelName: "fake-model",
      factsSnapshot: facts,
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      expiresAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    const cached = await repository.getCachedReason({
      cacheKey,
      now: new Date("2026-07-05T00:00:00.000Z"),
    });

    expect(cached?.reasonText).toBe("保存的 AI 理由");
    expect(cached?.modelName).toBe("fake-model");
  });

  it("treats expired cached AI reason as a miss", async () => {
    const repository = createInMemoryAiReasoningRepository();
    const facts = createFacts();
    const cacheKey = createAiReasoningCacheKey(facts);

    await repository.saveCachedReason({
      cacheKey,
      reasonText: "过期的 AI 理由",
      factsSnapshot: facts,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-07-02T00:00:00.000Z"),
    });

    const cached = await repository.getCachedReason({
      cacheKey,
      now: new Date("2026-07-03T00:00:00.000Z"),
    });

    expect(cached).toBeUndefined();
  });

  it("allows the request that reaches the daily limit and increments the count", async () => {
    const repository = createInMemoryAiReasoningRepository({
      dailyUsages: {
        "2026-07-04": 99,
      },
    });

    const result = await repository.tryConsumeDailyUsage({
      usageDate: "2026-07-04",
      dailyLimit: 100,
      now: new Date("2026-07-04T10:00:00.000Z"),
    });

    expect(result).toEqual({
      allowed: true,
      requestCount: 100,
    });
  });

  it("blocks the request when the daily limit has already been reached", async () => {
    const repository = createInMemoryAiReasoningRepository({
      dailyUsages: {
        "2026-07-04": 100,
      },
    });

    const result = await repository.tryConsumeDailyUsage({
      usageDate: "2026-07-04",
      dailyLimit: 100,
      now: new Date("2026-07-04T10:00:00.000Z"),
    });

    expect(result).toEqual({
      allowed: false,
      requestCount: 100,
    });
  });

  it("does not increase daily usage when cache is hit", async () => {
    const repository = createInMemoryAiReasoningRepository({
      dailyUsages: {
        "2026-07-04": 7,
      },
    });
    const facts = createFacts();
    const cacheKey = createAiReasoningCacheKey(facts);

    await repository.saveCachedReason({
      cacheKey,
      reasonText: "缓存命中",
      factsSnapshot: facts,
      createdAt: new Date("2026-07-04T00:00:00.000Z"),
      expiresAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    await repository.getCachedReason({
      cacheKey,
      now: new Date("2026-07-05T00:00:00.000Z"),
    });

    expect(repository.getDailyUsageCount("2026-07-04")).toBe(7);
  });
});
