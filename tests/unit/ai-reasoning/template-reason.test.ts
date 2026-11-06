import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractSelectionReasonFactsFromEvaluation,
  extractSelectionReasonFactsFromSlot,
} from "@/modules/ai-reasoning/extract-reason-facts";
import { createTemplateSelectionReason } from "@/modules/ai-reasoning/template-reason";
import type { SelectionReasonFacts } from "@/modules/ai-reasoning/types";
import type {
  BoardAreaResult,
  CandidateLayer,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  MatchingCandidate,
  RejectedCandidateEvaluation,
  StrengthResult,
} from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";

function createLayer(overrides: Partial<CandidateLayer>): CandidateLayer {
  return {
    role: "outer_liner",
    paper: {
      id: "paper-1",
      paperCode: "P1",
      gramWeightGsm: 200,
      priceYuanPerTon: 3000,
      burstIndex: 10,
      ringCrushIndex: 20,
    },
    ...overrides,
  };
}

function createCandidate(id = "candidate-1"): MatchingCandidate {
  return {
    id,
    layerCount: 3,
    fluteType: "B",
    layers: [
      createLayer({
        role: "outer_liner",
        paper: { id: `${id}-outer`, paperCode: "K200" },
      }),
      createLayer({
        role: "corrugating",
        flute: "B",
        paper: { id: `${id}-corrugating`, paperCode: "W160" },
      }),
      createLayer({
        role: "inner_liner",
        paper: { id: `${id}-inner`, paperCode: "K200" },
      }),
    ],
  };
}

function createCost(taxIncludedCostYuan: number): CostResult {
  return {
    utilizationRate: 0.88,
    padFeeYuan: 0,
    layerUnitPrices: [],
    paperCostYuan: 1.2,
    processingFeeYuan: 0.8,
    taxYuan: 0.35,
    taxIncludedCostYuan,
  };
}

function createStrength(input: {
  bctN: number;
  edgeCrushKnPerM: number;
  burstStrength: number;
  isQualified?: boolean;
}): StrengthResult {
  return {
    burstStrength: input.burstStrength,
    edgeCrushNPerM: input.edgeCrushKnPerM * 1000,
    edgeCrushKnPerM: input.edgeCrushKnPerM,
    bctN: input.bctN,
    isQualified: input.isQualified ?? true,
    reasons: [],
  };
}

function createEligibleEvaluation(): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: createCandidate(),
    area: {} as BoardAreaResult,
    device: { isManufacturable: true, reasons: [] } satisfies DeviceLimitResult,
    strength: createStrength({
      bctN: 900,
      edgeCrushKnPerM: 4.12,
      burstStrength: 780,
    }),
    cost: createCost(2.35),
  };
}

function createRejectedEvaluation(input: {
  reasonType: RejectedCandidateEvaluation["reasons"][number]["type"];
  message: string;
  cost?: CostResult | undefined;
  strength?: StrengthResult | undefined;
}): RejectedCandidateEvaluation {
  const reason = {
    type: input.reasonType,
    code: input.reasonType,
    message: input.message,
  };

  return {
    status: "rejected",
    candidate: createCandidate("rejected-candidate"),
    reasons: [reason],
    area: {} as BoardAreaResult,
    device: {
      isManufacturable: input.reasonType !== "NOT_MANUFACTURABLE",
      reasons: input.reasonType === "NOT_MANUFACTURABLE" ? [reason] : [],
    },
    strength: input.strength,
    cost: input.cost,
  };
}

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

describe("createTemplateSelectionReason", () => {
  it("creates the fixed four sections for a qualified scheme with complete facts", () => {
    const reason = createTemplateSelectionReason({ facts: createFacts() });

    expect(reason.source).toBe("template");
    expect(reason.sourceLabel).toBe("模板生成");
    expect(reason.text).toContain("成本");
    expect(reason.text).toContain("2.35");
    expect(reason.text).toContain("强度");
    expect(reason.text).toContain("900 N");
    expect(reason.text).toContain("4.12 kN/m");
    expect(reason.text).toContain("780");
    expect(reason.text).toContain("可生产状态");
    expect(reason.text).toContain("风险提示");
  });

  it("does not warn against production when a qualified scheme has no risks", () => {
    const reason = createTemplateSelectionReason({ facts: createFacts() });

    expect(reason.text).toContain("当前未发现强度或设备风险");
    expect(reason.text).not.toContain("不建议生产");
  });

  it("keeps strength risks visible for an unqualified scheme without describing it as qualified", () => {
    const reason = createTemplateSelectionReason({
      facts: createFacts({
        finalStatus: "unqualified",
        riskMessages: ["边压不足"],
      }),
    });

    expect(reason.text).toContain("边压不足");
    expect(reason.text).not.toContain("已达标");
  });

  it("keeps device risks visible for a not manufacturable scheme without describing it as ready for production", () => {
    const reason = createTemplateSelectionReason({
      facts: createFacts({
        finalStatus: "not_manufacturable",
        riskMessages: ["超过设备最大宽度"],
      }),
    });

    expect(reason.text).toContain("不可生产");
    expect(reason.text).toContain("超过设备最大宽度");
    expect(reason.text).not.toMatch(/当前为可生产|满足设备限制|生产无障碍/);
  });

  it("marks data as incomplete when cost is missing", () => {
    const reason = createTemplateSelectionReason({
      facts: createFacts({
        finalStatus: "data_incomplete",
        cost: undefined,
        riskMessages: ["缺少原纸价格"],
      }),
    });

    expect(reason.text).toContain("暂无完整成本数据");
    expect(reason.text).toContain("数据不足");
  });

  it("does not invent zero strength values when strength is missing", () => {
    const reason = createTemplateSelectionReason({
      facts: createFacts({
        strength: undefined,
      }),
    });

    expect(reason.text).toContain("暂无完整强度数据");
    expect(reason.text).not.toContain("0 N");
  });
});

describe("extractSelectionReasonFacts", () => {
  it("extracts risk messages from rejected strength evaluations", () => {
    const facts = extractSelectionReasonFactsFromEvaluation({
      evaluation: createRejectedEvaluation({
        reasonType: "STRENGTH_UNQUALIFIED",
        message: "边压不足",
        cost: createCost(2.35),
        strength: createStrength({
          bctN: 700,
          edgeCrushKnPerM: 3.8,
          burstStrength: 780,
          isQualified: false,
        }),
      }),
      strategy: "economy",
      isOfficialRecommendation: false,
    });

    expect(facts.finalStatus).toBe("unqualified");
    expect(facts.riskMessages).toContain("边压不足");
  });

  it("marks reference slots as not official recommendations", () => {
    const slot: RecommendationSlot = {
      strategy: "economy",
      title: "经济型" as RecommendationSlot["title"],
      status: "reference",
      isOfficialRecommendation: true,
      evaluation: createEligibleEvaluation(),
      messages: ["当前仅供调整参考"],
      unavailableReasons: [],
    };

    const facts = extractSelectionReasonFactsFromSlot(slot);

    expect(facts.isOfficialRecommendation).toBe(false);
    expect(facts.statusMessages).toContain("当前仅供调整参考");
  });
});

describe("ai-reasoning boundaries", () => {
  it("does not depend on app pages, server actions, or calculation write logic", () => {
    const moduleDir = join(process.cwd(), "src", "modules", "ai-reasoning");
    const sources = ["types.ts", "template-reason.ts", "extract-reason-facts.ts"]
      .map((fileName) => readFileSync(join(moduleDir, fileName), "utf8"))
      .join("\n");

    expect(sources).not.toContain("@/app");
    expect(sources).not.toContain("@/server/actions");
    expect(sources).not.toContain("evaluateCandidate(");
    expect(sources).not.toContain("selectMatchingRecommendations(");
  });
});
