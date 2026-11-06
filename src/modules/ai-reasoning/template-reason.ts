import type {
  SelectionReason,
  SelectionReasonFacts,
  SelectionReasonFallbackReason,
} from "@/modules/ai-reasoning/types";

export function createTemplateSelectionReason(input: {
  facts: SelectionReasonFacts;
  fallbackReason?: SelectionReasonFallbackReason | undefined;
  now?: Date | undefined;
}): SelectionReason {
  const reason: SelectionReason = {
    source: "template",
    sourceLabel: "模板生成",
    text: createTemplateReasonText(input.facts),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };

  if (input.fallbackReason !== undefined) {
    reason.fallbackReason = input.fallbackReason;
  }

  return reason;
}

export function createTemplateReasonText(facts: SelectionReasonFacts): string {
  return [
    createCostSection(facts),
    createStrengthSection(facts),
    createManufacturingStatusSection(facts),
    createRiskSection(facts),
  ].join("\n");
}

function createCostSection(facts: SelectionReasonFacts): string {
  const cost = facts.cost;
  if (cost === undefined || !Number.isFinite(cost.taxIncludedCostYuan)) {
    return "成本：暂无完整成本数据，不能编造成本结论。";
  }

  return `成本：该方案含税成本为 ${formatDecimal(cost.taxIncludedCostYuan, 2)} 元，适合作为${facts.strategyLabel}判断的参考。`;
}

function createStrengthSection(facts: SelectionReasonFacts): string {
  const strength = facts.strength;
  if (
    strength === undefined ||
    !Number.isFinite(strength.bctN) ||
    !Number.isFinite(strength.edgeCrushKnPerM) ||
    !Number.isFinite(strength.burstStrength)
  ) {
    return "强度：暂无完整强度数据，不能编造强度结论。";
  }

  return `强度：空箱抗压 ${formatInteger(strength.bctN)} N，边压 ${formatDecimal(strength.edgeCrushKnPerM, 2)} kN/m，耐破 ${formatInteger(strength.burstStrength)}。`;
}

function createManufacturingStatusSection(facts: SelectionReasonFacts): string {
  const statusTextByStatus: Record<SelectionReasonFacts["finalStatus"], string> = {
    qualified: "达标且可生产",
    unqualified: "未达标，需先处理强度风险后再判断生产适配",
    not_manufacturable: "不可生产，需先处理设备限制",
    data_incomplete: "数据不足，需补齐计算结果后再判断",
  };

  return `可生产状态：该方案当前为${statusTextByStatus[facts.finalStatus]}。`;
}

function createRiskSection(facts: SelectionReasonFacts): string {
  const riskText = facts.riskMessages.filter((message) => message.trim().length > 0).join("；");

  if (riskText.length > 0) {
    if (facts.finalStatus === "data_incomplete") {
      return `风险提示：数据不足：${riskText}。`;
    }

    if (facts.finalStatus === "not_manufacturable") {
      return `风险提示：${riskText}。该方案不可生产，需先处理设备限制。`;
    }

    if (facts.finalStatus === "unqualified") {
      return `风险提示：${riskText}。该方案未达标，不建议生产。`;
    }

    return `风险提示：${riskText}。`;
  }

  if (facts.finalStatus === "qualified") {
    return "风险提示：当前未发现强度或设备风险。";
  }

  if (facts.finalStatus === "unqualified") {
    return "风险提示：方案未达标，不建议生产。";
  }

  if (facts.finalStatus === "not_manufacturable") {
    return "风险提示：方案不可生产，需先处理设备限制。";
  }

  return "风险提示：数据不足，需补齐成本、强度或设备校核结果。";
}

function formatDecimal(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
}

function formatInteger(value: number): string {
  return Math.round(value).toString();
}
