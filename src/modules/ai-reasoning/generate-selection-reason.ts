import { createTemplateSelectionReason } from "@/modules/ai-reasoning/template-reason";
import { extractSelectionReasonFactsFromSlot } from "@/modules/ai-reasoning/extract-reason-facts";
import {
  addDays,
  createAiReasoningCacheKey,
  createAiReasoningUsageDate,
  type AiReasoningRepository,
} from "@/modules/ai-reasoning/cache";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import type {
  SelectionReason,
  SelectionReasonFacts,
  SelectionReasonFallbackReason,
} from "@/modules/ai-reasoning/types";
import { validateAiSelectionReason } from "@/modules/ai-reasoning/validate-ai-reason";

export interface AiReasoningProvider {
  generateSelectionReason(input: { facts: SelectionReasonFacts; timeoutMs: number }): Promise<{
    text: string;
    modelName?: string | undefined;
  }>;
}

export interface AiReasoningOptions {
  timeoutMs: number;
  dailyLimit: number;
  cacheTtlDays: number;
}

export interface CreateSelectionReasonInput {
  facts: SelectionReasonFacts;
  provider?: AiReasoningProvider | undefined;
  repository?: AiReasoningRepository | undefined;
  options?: Partial<AiReasoningOptions> | undefined;
  now?: Date | undefined;
}

export interface AttachSelectionReasonsToSlotsInput {
  slots: RecommendationSlot[];
  provider?: AiReasoningProvider | undefined;
  repository?: AiReasoningRepository | undefined;
  options?: Partial<AiReasoningOptions> | undefined;
  now?: Date | undefined;
  createSelectionReasonFn?:
    ((input: CreateSelectionReasonInput) => Promise<SelectionReason>) | undefined;
}

const DEFAULT_OPTIONS: AiReasoningOptions = {
  timeoutMs: 1500,
  dailyLimit: 100,
  cacheTtlDays: 30,
};

export async function createSelectionReason(
  input: CreateSelectionReasonInput,
): Promise<SelectionReason> {
  const options = {
    ...DEFAULT_OPTIONS,
    ...input.options,
  };
  const now = input.now ?? new Date();
  const cacheKey = createAiReasoningCacheKey(input.facts);

  if (input.repository !== undefined) {
    const cachedReason = await input.repository.getCachedReason({
      cacheKey,
      now,
    });

    if (cachedReason !== undefined) {
      return {
        source: "ai",
        sourceLabel: "AI 生成",
        text: cachedReason.reasonText,
        generatedAt: now.toISOString(),
      };
    }
  }

  if (input.provider === undefined) {
    return createTemplateFallback(input, "provider_not_configured");
  }

  if (input.repository !== undefined) {
    const dailyUsage = await input.repository.tryConsumeDailyUsage({
      usageDate: createAiReasoningUsageDate(now),
      dailyLimit: options.dailyLimit,
      now,
    });

    if (!dailyUsage.allowed) {
      return createTemplateFallback(input, "daily_limit_reached");
    }
  }

  const providerResult = await callProviderWithTimeout({
    provider: input.provider,
    facts: input.facts,
    timeoutMs: options.timeoutMs,
  });

  if (providerResult.status === "timeout") {
    return createTemplateFallback(input, "provider_timeout");
  }

  if (providerResult.status === "failed") {
    return createTemplateFallback(input, "provider_failed");
  }

  const validation = validateAiSelectionReason({
    facts: input.facts,
    text: providerResult.value.text,
  });

  if (!validation.isValid) {
    return createTemplateFallback(input, validation.reason ?? "validation_failed");
  }

  if (input.repository !== undefined) {
    await input.repository.saveCachedReason({
      cacheKey,
      reasonText: providerResult.value.text,
      modelName: providerResult.value.modelName,
      factsSnapshot: input.facts,
      createdAt: now,
      expiresAt: addDays(now, options.cacheTtlDays),
    });
  }

  return {
    source: "ai",
    sourceLabel: "AI 生成",
    text: providerResult.value.text,
    generatedAt: now.toISOString(),
  };
}

export async function attachSelectionReasonsToSlots(
  input: AttachSelectionReasonsToSlotsInput,
): Promise<RecommendationSlot[]> {
  const createReason = input.createSelectionReasonFn ?? createSelectionReason;
  const slotsWithReasons = await Promise.all(
    input.slots.map(async (slot): Promise<RecommendationSlot> => {
      const facts = extractSelectionReasonFactsFromSlot(slot);

      if (slot.evaluation === undefined) {
        return {
          ...slot,
          selectionReason: createTemplateSelectionReason({
            facts,
            now: input.now,
          }),
        };
      }

      const selectionReason = await createReason({
        facts,
        provider: input.provider,
        repository: input.repository,
        options: input.options,
        now: input.now,
      });

      return {
        ...slot,
        selectionReason,
      };
    }),
  );

  return slotsWithReasons;
}

function createTemplateFallback(
  input: CreateSelectionReasonInput,
  fallbackReason: SelectionReasonFallbackReason,
): SelectionReason {
  return createTemplateSelectionReason({
    facts: input.facts,
    fallbackReason,
    now: input.now,
  });
}

async function callProviderWithTimeout(input: {
  provider: AiReasoningProvider;
  facts: SelectionReasonFacts;
  timeoutMs: number;
}): Promise<
  | {
      status: "success";
      value: Awaited<ReturnType<AiReasoningProvider["generateSelectionReason"]>>;
    }
  | { status: "failed" }
  | { status: "timeout" }
> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ status: "timeout" });
    }, input.timeoutMs);

    input.provider
      .generateSelectionReason({
        facts: input.facts,
        timeoutMs: input.timeoutMs,
      })
      .then((value) => {
        clearTimeout(timeoutId);
        resolve({ status: "success", value });
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve({ status: "failed" });
      });
  });
}
