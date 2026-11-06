import { and, eq, gt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { aiReasoningCache, aiReasoningDailyUsages } from "@/db/schema";
import type * as schema from "@/db/schema";
import type {
  AiReasoningCachedReason,
  AiReasoningDailyUsageResult,
  AiReasoningRepository,
} from "@/modules/ai-reasoning/cache";
import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";

type AppDatabase = NodePgDatabase<typeof schema>;
type AiReasoningCacheRow = typeof aiReasoningCache.$inferSelect;

export function createDrizzleAiReasoningRepository(db: AppDatabase): AiReasoningRepository {
  return new DrizzleAiReasoningRepository(db);
}

class DrizzleAiReasoningRepository implements AiReasoningRepository {
  constructor(private readonly db: AppDatabase) {}

  async getCachedReason(input: {
    cacheKey: string;
    now: Date;
  }): Promise<AiReasoningCachedReason | undefined> {
    const [row] = await this.db
      .select()
      .from(aiReasoningCache)
      .where(
        and(
          eq(aiReasoningCache.cacheKey, input.cacheKey),
          gt(aiReasoningCache.expiresAt, input.now),
        ),
      )
      .limit(1);

    return row ? toCachedReason(row) : undefined;
  }

  async saveCachedReason(input: AiReasoningCachedReason): Promise<void> {
    await this.db
      .insert(aiReasoningCache)
      .values({
        cacheKey: input.cacheKey,
        reasonText: input.reasonText,
        modelName: input.modelName ?? null,
        factsSnapshot: input.factsSnapshot,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: aiReasoningCache.cacheKey,
        set: {
          reasonText: input.reasonText,
          modelName: input.modelName ?? null,
          factsSnapshot: input.factsSnapshot,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        },
      });
  }

  async tryConsumeDailyUsage(input: {
    usageDate: string;
    dailyLimit: number;
    now: Date;
  }): Promise<AiReasoningDailyUsageResult> {
    const [row] = await this.db
      .select({
        requestCount: aiReasoningDailyUsages.requestCount,
      })
      .from(aiReasoningDailyUsages)
      .where(eq(aiReasoningDailyUsages.usageDate, input.usageDate))
      .limit(1);

    if (!row) {
      await this.db.insert(aiReasoningDailyUsages).values({
        usageDate: input.usageDate,
        requestCount: 1,
        createdAt: input.now,
        updatedAt: input.now,
      });

      return {
        allowed: true,
        requestCount: 1,
      };
    }

    if (row.requestCount >= input.dailyLimit) {
      return {
        allowed: false,
        requestCount: row.requestCount,
      };
    }

    const nextCount = row.requestCount + 1;

    await this.db
      .update(aiReasoningDailyUsages)
      .set({
        requestCount: nextCount,
        updatedAt: input.now,
      })
      .where(eq(aiReasoningDailyUsages.usageDate, input.usageDate));

    return {
      allowed: true,
      requestCount: nextCount,
    };
  }
}

function toCachedReason(row: AiReasoningCacheRow): AiReasoningCachedReason {
  const cachedReason: AiReasoningCachedReason = {
    cacheKey: row.cacheKey,
    reasonText: row.reasonText,
    factsSnapshot: row.factsSnapshot as SelectionReasonFacts,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };

  if (row.modelName !== null) {
    cachedReason.modelName = row.modelName;
  }

  return cachedReason;
}
