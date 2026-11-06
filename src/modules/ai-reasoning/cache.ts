import { createHash } from "node:crypto";

import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";

export interface AiReasoningCachedReason {
  cacheKey: string;
  reasonText: string;
  modelName?: string | undefined;
  factsSnapshot: SelectionReasonFacts;
  createdAt: Date;
  expiresAt: Date;
}

export interface AiReasoningDailyUsageResult {
  allowed: boolean;
  requestCount: number;
}

export interface AiReasoningRepository {
  getCachedReason(input: {
    cacheKey: string;
    now: Date;
  }): Promise<AiReasoningCachedReason | undefined>;
  saveCachedReason(input: AiReasoningCachedReason): Promise<void>;
  tryConsumeDailyUsage(input: {
    usageDate: string;
    dailyLimit: number;
    now: Date;
  }): Promise<AiReasoningDailyUsageResult>;
}

export interface InMemoryAiReasoningRepository extends AiReasoningRepository {
  getDailyUsageCount(usageDate: string): number;
}

export function createAiReasoningCacheKey(facts: SelectionReasonFacts): string {
  const stableFacts = {
    strategy: facts.strategy,
    layerCount: facts.layerCount,
    fluteType: facts.fluteType,
    paperSummary: facts.paperSummary,
    taxIncludedCostYuan: facts.cost?.taxIncludedCostYuan ?? null,
    bctN: facts.strength?.bctN ?? null,
    edgeCrushKnPerM: facts.strength?.edgeCrushKnPerM ?? null,
    burstStrength: facts.strength?.burstStrength ?? null,
    finalStatus: facts.finalStatus,
    riskMessages: facts.riskMessages,
    isOfficialRecommendation: facts.isOfficialRecommendation,
  };

  return createHash("sha256").update(JSON.stringify(stableFacts)).digest("hex");
}

export function createAiReasoningUsageDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

export function createInMemoryAiReasoningRepository(input: {
  cachedReasons?: AiReasoningCachedReason[] | undefined;
  dailyUsages?: Record<string, number> | undefined;
} = {}): InMemoryAiReasoningRepository {
  const cachedReasonsByKey = new Map<string, AiReasoningCachedReason>();
  const dailyUsagesByDate = new Map<string, number>(Object.entries(input.dailyUsages ?? {}));

  for (const cachedReason of input.cachedReasons ?? []) {
    cachedReasonsByKey.set(cachedReason.cacheKey, cachedReason);
  }

  return {
    async getCachedReason({ cacheKey, now }) {
      const cachedReason = cachedReasonsByKey.get(cacheKey);

      if (cachedReason === undefined || cachedReason.expiresAt <= now) {
        return undefined;
      }

      return cachedReason;
    },
    async saveCachedReason(cachedReason) {
      cachedReasonsByKey.set(cachedReason.cacheKey, cachedReason);
    },
    async tryConsumeDailyUsage({ usageDate, dailyLimit }) {
      const currentCount = dailyUsagesByDate.get(usageDate) ?? 0;

      if (currentCount >= dailyLimit) {
        return {
          allowed: false,
          requestCount: currentCount,
        };
      }

      const nextCount = currentCount + 1;
      dailyUsagesByDate.set(usageDate, nextCount);

      return {
        allowed: true,
        requestCount: nextCount,
      };
    },
    getDailyUsageCount(usageDate) {
      return dailyUsagesByDate.get(usageDate) ?? 0;
    },
  };
}
