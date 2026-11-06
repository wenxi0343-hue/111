import type { AiReasoningProvider } from "@/modules/ai-reasoning/generate-selection-reason";
import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";

type AiReasoningFetch = (input: string, init: RequestInit) => Promise<Response>;
type AiProviderApiFormat = "responses" | "chat_completions" | "pollinations_text";

interface OpenAiReasoningProviderConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  model?: string | undefined;
  apiFormat?: AiProviderApiFormat | undefined;
  fetchFn?: AiReasoningFetch | undefined;
}

interface OpenAiResponsePayload {
  model?: unknown;
  output_text?: unknown;
  output?: unknown;
}

interface ChatCompletionsPayload {
  model?: unknown;
  choices?: unknown;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_REASONING_MODEL = "gpt-4.1-mini";

export function createConfiguredAiReasoningProvider(
  env: Record<string, string | undefined> = process.env,
): AiReasoningProvider | undefined {
  const baseUrl = env.AI_PROVIDER_BASE_URL?.trim();
  const apiFormat = resolveApiFormat(env.AI_PROVIDER_API_FORMAT);
  const apiKey = resolveApiKey({
    baseUrl,
    providerApiKey: env.AI_PROVIDER_API_KEY,
    openAiApiKey: env.OPENAI_API_KEY,
  });

  if (!apiKey && apiFormat !== "pollinations_text") {
    return undefined;
  }

  return createOpenAiReasoningProvider({
    apiKey: apiKey ?? "",
    baseUrl,
    model: env.AI_REASONING_MODEL,
    apiFormat,
  });
}

export function createOpenAiReasoningProvider(
  config: OpenAiReasoningProviderConfig,
): AiReasoningProvider {
  const baseUrl = trimTrailingSlash(config.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL);
  const model = config.model?.trim() || DEFAULT_REASONING_MODEL;
  const apiFormat = config.apiFormat ?? "responses";
  const fetchFn = config.fetchFn ?? fetch;

  return {
    async generateSelectionReason({ facts, timeoutMs }) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const request = createProviderRequest({
          baseUrl,
          model,
          apiKey: config.apiKey,
          apiFormat,
          facts,
          signal: controller.signal,
        });
        const response = await fetchFn(request.url, request.init);

        if (!response.ok) {
          throw new Error(`AI reason provider failed with status ${response.status}`);
        }

        const { text, modelName } = await extractProviderResult({
          response,
          apiFormat,
          fallbackModel: model,
        });

        if (text.length === 0) {
          throw new Error("AI reason provider returned empty text");
        }

        return {
          text,
          modelName,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function createProviderRequest(input: {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiFormat: AiProviderApiFormat;
  facts: SelectionReasonFacts;
  signal: AbortSignal;
}): { url: string; init: RequestInit } {
  if (input.apiFormat === "pollinations_text") {
    return {
      url: `${input.baseUrl}/${encodeURIComponent(createPollinationsPrompt(input.facts))}`,
      init: {
        method: "GET",
        headers: {},
        signal: input.signal,
      },
    };
  }

  const commonInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    signal: input.signal,
  };

  if (input.apiFormat === "chat_completions") {
    return {
      url: `${input.baseUrl}/chat/completions`,
      init: {
        ...commonInit,
        body: JSON.stringify({
          model: input.model,
          messages: [
            {
              role: "system",
              content: createSystemPrompt(),
            },
            {
              role: "user",
              content: createUserPrompt(input.facts),
            },
          ],
          temperature: 0.2,
          max_tokens: 220,
        }),
      },
    };
  }

  return {
    url: `${input.baseUrl}/responses`,
    init: {
      ...commonInit,
      body: JSON.stringify({
        model: input.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: createSystemPrompt(),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: createUserPrompt(input.facts),
              },
            ],
          },
        ],
        temperature: 0.2,
        max_output_tokens: 220,
      }),
    },
  };
}

function createSystemPrompt(): string {
  return [
    "你是纸箱厂工艺助手，只负责给已计算出的配纸方案写选型理由。",
    "只能使用用户提供的事实，不得改写成本、强度、可生产状态或推荐结论。",
    "输出中文 1 到 2 句话，面向业务人员，避免列清单。",
    "如果存在风险，必须原样提到风险内容；如果不是正式推荐，不得说成正式推荐或达标推荐。",
  ].join("\n");
}

function createUserPrompt(facts: SelectionReasonFacts): string {
  return JSON.stringify(
    {
      strategyLabel: facts.strategyLabel,
      isOfficialRecommendation: facts.isOfficialRecommendation,
      finalStatus: facts.finalStatus,
      layerCount: facts.layerCount,
      fluteType: facts.fluteType,
      paperSummary: facts.paperSummary,
      cost: facts.cost,
      strength: facts.strength,
      riskMessages: facts.riskMessages,
      statusMessages: facts.statusMessages,
    },
    null,
    2,
  );
}

function createPollinationsPrompt(facts: SelectionReasonFacts): string {
  return [
    createSystemPrompt(),
    "请直接输出选型理由正文，不要解释输入内容。",
    createUserPrompt(facts),
  ].join("\n\n");
}

async function extractProviderResult(input: {
  response: Response;
  apiFormat: AiProviderApiFormat;
  fallbackModel: string;
}): Promise<{ text: string; modelName: string }> {
  if (input.apiFormat === "pollinations_text") {
    return {
      text: (await input.response.text()).trim(),
      modelName: input.fallbackModel,
    };
  }

  const payload = (await input.response.json()) as OpenAiResponsePayload | ChatCompletionsPayload;
  const text =
    input.apiFormat === "chat_completions"
      ? extractChatCompletionsText(payload as ChatCompletionsPayload).trim()
      : extractResponseText(payload as OpenAiResponsePayload).trim();

  return {
    text,
    modelName: typeof payload.model === "string" ? payload.model : input.fallbackModel,
  };
}

function extractResponseText(payload: OpenAiResponsePayload): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return "";
  }

  const textParts: string[] = [];

  for (const outputItem of payload.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (typeof contentItem.text === "string") {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join("\n");
}

function extractChatCompletionsText(payload: ChatCompletionsPayload): string {
  if (!Array.isArray(payload.choices)) {
    return "";
  }

  const textParts: string[] = [];

  for (const choice of payload.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const content = choice.message.content;

    if (typeof content === "string") {
      textParts.push(content);
      continue;
    }

    if (Array.isArray(content)) {
      for (const contentPart of content) {
        if (isRecord(contentPart) && typeof contentPart.text === "string") {
          textParts.push(contentPart.text);
        }
      }
    }
  }

  return textParts.join("\n");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmedValue = value?.trim();

    if (trimmedValue) {
      return trimmedValue;
    }
  }

  return undefined;
}

function resolveApiKey(input: {
  baseUrl?: string | undefined;
  providerApiKey?: string | undefined;
  openAiApiKey?: string | undefined;
}): string | undefined {
  const providerApiKey = firstNonEmpty(input.providerApiKey);

  if (providerApiKey !== undefined) {
    return providerApiKey;
  }

  if (input.baseUrl && !isOpenAiBaseUrl(input.baseUrl)) {
    return undefined;
  }

  return firstNonEmpty(input.openAiApiKey);
}

function isOpenAiBaseUrl(baseUrl: string): boolean {
  return baseUrl.trim().length === 0 || baseUrl.includes("api.openai.com");
}

function resolveApiFormat(value: string | undefined): AiProviderApiFormat {
  const trimmedValue = value?.trim();

  if (trimmedValue === "chat_completions" || trimmedValue === "pollinations_text") {
    return trimmedValue;
  }

  return "responses";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
