import type {
  SelectionReasonFacts,
  SelectionReasonFallbackReason,
} from "@/modules/ai-reasoning/types";

export interface AiSelectionReasonValidationResult {
  isValid: boolean;
  reason?: SelectionReasonFallbackReason | undefined;
}

export function validateAiSelectionReason(input: {
  facts: SelectionReasonFacts;
  text: string;
}): AiSelectionReasonValidationResult {
  const text = normalizeText(input.text);

  if (text.length === 0) {
    return invalid();
  }

  if (input.facts.finalStatus === "unqualified") {
    if (
      containsAny(text, ["已达标", "满足强度要求", "强度满足要求", "可作为达标方案"]) ||
      !containsRiskMessage(text, input.facts.riskMessages)
    ) {
      return invalid();
    }
  }

  if (input.facts.finalStatus === "not_manufacturable") {
    if (
      containsAny(text, ["可生产", "满足设备限制", "生产无障碍"]) ||
      !containsRiskMessage(text, input.facts.riskMessages)
    ) {
      return invalid();
    }
  }

  if (input.facts.finalStatus === "data_incomplete") {
    if (
      containsAny(text, ["数据完整", "结果可靠"]) ||
      !containsAny(text, ["数据不足", ...input.facts.riskMessages])
    ) {
      return invalid();
    }
  }

  if (!input.facts.isOfficialRecommendation) {
    if (containsAny(text, ["正式推荐", "推荐达标方案"])) {
      return invalid();
    }
  }

  return { isValid: true };
}

function invalid(): AiSelectionReasonValidationResult {
  return {
    isValid: false,
    reason: "validation_failed",
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, "");
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => pattern.trim().length > 0 && text.includes(normalizeText(pattern)));
}

function containsRiskMessage(text: string, riskMessages: string[]): boolean {
  if (riskMessages.length === 0) {
    return true;
  }

  return containsAny(text, riskMessages);
}
