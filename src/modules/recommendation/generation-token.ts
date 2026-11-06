import { createHmac, timingSafeEqual } from "node:crypto";

import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { RecommendationSlot, RecommendationStrategy } from "@/modules/recommendation/types";

import { createMatchingCandidateFingerprint } from "./scoring";

export interface GenerationTokenPayload {
  boxSpec: NormalizedBoxSpec;
  slots: RecommendationSlot[];
}

export interface VerifyGenerationTokenInput extends GenerationTokenPayload {
  selectedStrategy: RecommendationStrategy;
  token: string;
  secret: string;
}

const TOKEN_VERSION = "v1";

export function createGenerationToken(input: GenerationTokenPayload & { secret: string }): string {
  const payload = createCanonicalPayload(input);
  const signature = signPayload(payload, input.secret);

  return `${TOKEN_VERSION}.${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

export function verifyGenerationToken(input: VerifyGenerationTokenInput):
  | { ok: true }
  | { ok: false; message: string } {
  if (!input.token) {
    return { ok: false, message: "请重新生成方案后保存" };
  }

  const parts = input.token.split(".");

  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    return { ok: false, message: "请重新生成方案后保存" };
  }

  const payload = createCanonicalPayload(input);
  const expectedSignature = signPayload(payload, input.secret);
  const actualSignature = parts[2] ?? "";

  if (!safeEqual(actualSignature, expectedSignature)) {
    return { ok: false, message: "请重新生成方案后保存" };
  }

  const selectedSlot = input.slots.find((slot) => slot.strategy === input.selectedStrategy);

  if (!selectedSlot?.evaluation) {
    return { ok: false, message: "请选择一套方案" };
  }

  return { ok: true };
}

export function resolveGenerationTokenSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.MATCHING_GENERATION_TOKEN_SECRET ??
    env.AUTH_SESSION_SECRET ??
    "paper-box-matching-local-generation-token"
  );
}

function createCanonicalPayload(input: GenerationTokenPayload): string {
  return stableStringify({
    boxSpec: input.boxSpec,
    slots: input.slots.map((slot) => ({
      strategy: slot.strategy,
      status: slot.status,
      fingerprint: slot.evaluation
        ? createMatchingCandidateFingerprint(slot.evaluation.candidate)
        : null,
    })),
  });
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
