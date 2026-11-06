import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredAiReasoningProvider,
  createOpenAiReasoningProvider,
} from "@/modules/ai-reasoning/openai-provider";
import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";

function createFacts(overrides: Partial<SelectionReasonFacts> = {}): SelectionReasonFacts {
  return {
    strategy: "economy",
    strategyLabel: "经济型",
    isOfficialRecommendation: true,
    finalStatus: "qualified",
    layerCount: 5,
    fluteType: "BC",
    paperSummary: ["面纸 K200", "B瓦 160", "芯纸 100", "C瓦 160", "里纸 K200"],
    cost: { taxIncludedCostYuan: 3.25 },
    strength: {
      bctN: 1200,
      edgeCrushKnPerM: 5.2,
      burstStrength: 920,
    },
    riskMessages: [],
    statusMessages: [],
    ...overrides,
  };
}

describe("createOpenAiReasoningProvider", () => {
  it("calls the OpenAI-compatible Responses API and returns output text", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "test-model",
            output_text: "该经济型方案成本较低，强度满足要求，可生产。",
          }),
          { status: 200 },
        ),
    );
    const provider = createOpenAiReasoningProvider({
      apiKey: "test-key",
      baseUrl: "https://ai.example/v1/",
      model: "test-model",
      fetchFn,
    });

    const result = await provider.generateSelectionReason({
      facts: createFacts(),
      timeoutMs: 1500,
    });

    expect(result).toEqual({
      text: "该经济型方案成本较低，强度满足要求，可生产。",
      modelName: "test-model",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.example/v1/responses");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
    const body = JSON.parse(init.body as string) as {
      model: string;
      input: Array<{ role: string; content: Array<{ text: string }> }>;
    };
    expect(body.model).toBe("test-model");
    expect(JSON.stringify(body.input)).toContain("经济型");
    expect(JSON.stringify(body.input)).toContain("B瓦 160");
  });

  it("extracts text from nested Responses API output content", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    text: "该方案成本较低，强度满足要求，可生产。",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = createOpenAiReasoningProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchFn,
    });

    const result = await provider.generateSelectionReason({
      facts: createFacts(),
      timeoutMs: 1500,
    });

    expect(result.text).toBe("该方案成本较低，强度满足要求，可生产。");
    expect(result.modelName).toBe("test-model");
  });

  it("does not create a provider when no API key is configured", () => {
    expect(createConfiguredAiReasoningProvider({})).toBeUndefined();
  });

  it("accepts OPENAI_API_KEY as a compatible fallback", () => {
    expect(
      createConfiguredAiReasoningProvider({
        OPENAI_API_KEY: "test-key",
      }),
    ).toBeDefined();
  });

  it("calls the OpenAI-compatible Chat Completions API when configured", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "gemini-2.5-flash",
            choices: [
              {
                message: {
                  content: "该经济型方案成本较低，强度满足要求，可生产。",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const provider = createOpenAiReasoningProvider({
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.5-flash",
      apiFormat: "chat_completions",
      fetchFn,
    });

    const result = await provider.generateSelectionReason({
      facts: createFacts(),
      timeoutMs: 1500,
    });

    expect(result).toEqual({
      text: "该经济型方案成本较低，强度满足要求，可生产。",
      modelName: "gemini-2.5-flash",
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("gemini-2.5-flash");
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(JSON.stringify(body.messages)).toContain("B瓦 160");
  });

  it("does not reuse OPENAI_API_KEY for a non-OpenAI base URL", () => {
    expect(
      createConfiguredAiReasoningProvider({
        OPENAI_API_KEY: "openai-key",
        AI_PROVIDER_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
      }),
    ).toBeUndefined();
  });

  it("creates a keyless provider for the free text API format", () => {
    expect(
      createConfiguredAiReasoningProvider({
        AI_PROVIDER_BASE_URL: "https://text.pollinations.ai",
        AI_PROVIDER_API_FORMAT: "pollinations_text",
        AI_REASONING_MODEL: "openai",
      }),
    ).toBeDefined();
  });

  it("calls the free text API and returns the plain text response", async () => {
    const fetchFn = vi.fn(async () => new Response("该经济型方案成本较低，强度满足要求，可生产。", { status: 200 }));
    const provider = createOpenAiReasoningProvider({
      apiKey: "",
      baseUrl: "https://text.pollinations.ai",
      model: "openai",
      apiFormat: "pollinations_text",
      fetchFn,
    });

    const result = await provider.generateSelectionReason({
      facts: createFacts(),
      timeoutMs: 1500,
    });

    expect(result).toEqual({
      text: "该经济型方案成本较低，强度满足要求，可生产。",
      modelName: "openai",
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://text.pollinations.ai/")).toBe(true);
    expect(decodeURIComponent(url)).toContain("经济型");
    expect(decodeURIComponent(url)).toContain("B瓦 160");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({});
  });
});
