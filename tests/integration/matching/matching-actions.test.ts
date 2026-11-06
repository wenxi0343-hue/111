import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import { createInMemoryAiReasoningRepository } from "@/modules/ai-reasoning/cache";
import type { AiReasoningProvider } from "@/modules/ai-reasoning/generate-selection-reason";
import type { SelectionReason } from "@/modules/ai-reasoning/types";
import type { BoxSpecInput } from "@/modules/box-spec/types";
import { validateBoxSpecInput } from "@/modules/box-spec/validate-box-spec";
import type {
  ListRecommendablePaperMaterialsRepository,
  RecommendablePaperMaterial,
} from "@/modules/master-data/list-recommendable-paper-materials";
import type {
  BoardAreaResult,
  CostResult,
  DeviceLimitResult,
  EligibleCandidateEvaluation,
  MatchingCandidate,
  RejectedCandidateEvaluation,
  StrengthResult,
} from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import { createGenerationToken } from "@/modules/recommendation/generation-token";
import {
  MATCHING_BASE_DATA_ERROR_MESSAGE,
  checkMatchingReadinessFromRepository,
  type MatchingReadiness,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import {
  generateMatchingScheme,
  saveConfirmedMatchingScheme,
} from "@/server/actions/matching-actions";
import type {
  MatchingSchemeHistoryRecord,
  MatchingSchemeHistoryRecordInput,
  MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";
import type { MatchingSchemeExportRecord } from "@/modules/import-export/matching-scheme-pdf-types";

const sessionSecret = "matching-action-session-secret";
const validEnv = {
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_USERS_JSON: JSON.stringify([
    {
      username: "operator",
      displayName: "操作员",
      passwordHash: "scrypt$1024$8$1$c2FsdA$aGFzaA",
    },
  ]),
};

function createValidGenerationToken(
  slots: RecommendationSlot[],
  boxSpec: BoxSpecInput = createValidInput(),
): string {
  const validationResult = validateBoxSpecInput(boxSpec);

  if (!validationResult.ok) {
    throw new Error("test box spec should be valid");
  }

  return createGenerationToken({
    boxSpec: validationResult.data,
    slots,
    secret: sessionSecret,
  });
}

class InMemoryMatchingReadinessRepository implements MatchingReadinessRepository {
  callCount = 0;

  constructor(private readonly readiness: MatchingReadiness) {}

  async getMatchingReadiness() {
    this.callCount += 1;

    return this.readiness;
  }
}

class InMemoryPaperMaterialRepository implements ListRecommendablePaperMaterialsRepository {
  callCount = 0;

  constructor(private readonly materials: RecommendablePaperMaterial[] = []) {}

  async listRecommendablePaperMaterials() {
    this.callCount += 1;

    return this.materials;
  }
}

class InMemoryMatchingSchemeHistoryRepository implements MatchingSchemeHistoryRepository {
  records: MatchingSchemeHistoryRecord[] = [];

  async saveAndPruneLatest(input: MatchingSchemeHistoryRecordInput, limit: number) {
    const record: MatchingSchemeHistoryRecord = {
      id: `scheme-${this.records.length + 1}`,
      ...input,
      createdAt: input.createdAt ?? new Date("2026-07-02T00:00:00.000Z"),
    };

    this.records = [record, ...this.records]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);

    return record;
  }

  async listRecent(limit: number) {
    return this.records.slice(0, limit);
  }

  async findById(id: string) {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async appendExportRecord(id: string, exportRecord: MatchingSchemeExportRecord) {
    const record = await this.findById(id);

    if (!record) {
      return null;
    }

    const updatedRecord = {
      ...record,
      exportRecords: [...record.exportRecords, exportRecord],
    };

    this.records = this.records.map((item) => (item.id === id ? updatedRecord : item));

    return updatedRecord;
  }

}

function createReadiness(overrides: Partial<MatchingReadiness> = {}): MatchingReadiness {
  return {
    hasPaperFactories: true,
    hasLinerPaper: true,
    hasCorrugatingPaper: true,
    hasFormulaParameters: true,
    ...overrides,
  };
}

async function checkReadiness(readiness: MatchingReadiness) {
  return checkMatchingReadinessFromRepository({
    repository: new InMemoryMatchingReadinessRepository(readiness),
  });
}

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now: new Date("2026-07-01T00:00:00.000Z"),
  });

  return {
    get(name: string) {
      return name === "paper_box_auth_session" ? { value: session.value } : undefined;
    },
  };
}

function createValidInput(overrides: Partial<BoxSpecInput> = {}): BoxSpecInput {
  return {
    lengthMm: 500,
    widthMm: 300,
    heightMm: 250,
    structureType: "0201",
    formingMethod: "glue",
    productType: "食品",
    productWeightKg: 10,
    arrangement: "single_row",
    productionQuantity: 1000,
    ...overrides,
  };
}

function createCandidate(id: string): MatchingCandidate {
  return {
    id,
    layerCount: 3,
    fluteType: "B",
    layers: [
      {
        role: "outer_liner",
        paper: {
          id: `${id}-outer`,
          paperCode: `${id}-P1`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "corrugating",
        flute: "B",
        paper: {
          id: `${id}-corrugating`,
          paperCode: `${id}-W1`,
          gramWeightGsm: 160,
          priceYuanPerTon: 2800,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "inner_liner",
        paper: {
          id: `${id}-inner`,
          paperCode: `${id}-P2`,
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
    ],
  };
}

function createFiveLayerCandidate(id: string): MatchingCandidate {
  return {
    id,
    layerCount: 5,
    fluteType: "BC",
    layers: [
      {
        role: "outer_liner",
        paper: {
          id: `${id}-outer`,
          paperCode: `${id}-P1`,
          gramWeightGsm: 230,
          priceYuanPerTon: 3200,
          burstIndex: 12,
          ringCrushIndex: 24,
        },
      },
      {
        role: "corrugating",
        flute: "B",
        paper: {
          id: `${id}-corrugating-b`,
          paperCode: `${id}-W1`,
          gramWeightGsm: 140,
          priceYuanPerTon: 2700,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "medium",
        paper: {
          id: `${id}-medium`,
          paperCode: `${id}-M1`,
          gramWeightGsm: 120,
          priceYuanPerTon: 2600,
          burstIndex: 8,
          ringCrushIndex: 18,
        },
      },
      {
        role: "corrugating",
        flute: "C",
        paper: {
          id: `${id}-corrugating-c`,
          paperCode: `${id}-W2`,
          gramWeightGsm: 140,
          priceYuanPerTon: 2700,
          burstIndex: 10,
          ringCrushIndex: 20,
        },
      },
      {
        role: "inner_liner",
        paper: {
          id: `${id}-inner`,
          paperCode: `${id}-P2`,
          gramWeightGsm: 230,
          priceYuanPerTon: 3200,
          burstIndex: 12,
          ringCrushIndex: 24,
        },
      },
    ],
  };
}

function createRecommendablePaperMaterial(
  id: string,
  overrides: Partial<RecommendablePaperMaterial> = {},
): RecommendablePaperMaterial {
  return {
    id,
    paperCode: id.toUpperCase(),
    factoryId: `${id}-factory`,
    factoryName: `${id} 纸厂`,
    name: `${id} 原纸`,
    paperKind: "linerboard",
    gramWeightGsm: 230,
    applicableFlutes: [],
    priceYuanPerTon: 3600,
    burstIndex: 12,
    ringCrushIndex: 24,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

function createArea(): BoardAreaResult {
  return {
    innerLengthMm: 492,
    innerWidthMm: 292,
    innerHeightMm: 242,
    boardLengthMm: 1625,
    boardWidthMm: 548,
    feedLengthMm: 1625,
    feedWidthMm: 548,
    printLengthMm: 1625,
    printWidthMm: 548,
    slotIntervalsMm: {
      firstPanel: 492,
      firstSlot: 292,
      secondPanel: 492,
      secondSlot: 292,
    },
    areaSquareMeters: 0.8905,
    formingPieces: 1,
    flapMm: 150,
    tongueMm: 35,
  };
}

function createDevice(): DeviceLimitResult {
  return {
    isManufacturable: true,
    reasons: [],
  };
}

function createStrength(): StrengthResult {
  return {
    burstStrength: 3800,
    edgeCrushNPerM: 4500,
    edgeCrushKnPerM: 4.5,
    bctN: 450,
    isQualified: true,
    reasons: [],
  };
}

function createCost(): CostResult {
  return {
    utilizationRate: 0.88,
    padFeeYuan: 0,
    layerUnitPrices: [],
    paperCostYuan: 1.2,
    processingFeeYuan: 0.9,
    taxYuan: 0.03,
    taxIncludedCostYuan: 2.13,
  };
}

function createEligibleEvaluation(input: {
  candidate: MatchingCandidate;
  costYuan: number;
  bctN: number;
}): EligibleCandidateEvaluation {
  return {
    status: "eligible",
    candidate: input.candidate,
    area: createArea(),
    device: createDevice(),
    strength: {
      ...createStrength(),
      bctN: input.bctN,
    },
    cost: {
      ...createCost(),
      taxIncludedCostYuan: input.costYuan,
    },
  };
}

function createRecommendationSlot(
  strategy: RecommendationSlot["strategy"],
  evaluation = createEligibleEvaluation({
    candidate: createCandidate(strategy),
    costYuan: strategy === "economy" ? 2.1 : strategy === "safety" ? 2.5 : 2.3,
    bctN: strategy === "safety" ? 760 : 640,
  }),
): RecommendationSlot {
  return {
    strategy,
    title: strategy === "economy" ? "经济型" : strategy === "safety" ? "安全型" : "均衡型",
    status: "recommended",
    isOfficialRecommendation: true,
    evaluation,
    messages: [],
    unavailableReasons: [],
  };
}

function createStoredSelectionReason(
  sourceLabel: SelectionReason["sourceLabel"],
  text: string,
): SelectionReason {
  return {
    source: sourceLabel === "AI 生成" ? "ai" : "template",
    sourceLabel,
    text,
    generatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function createStrengthRejectedEvaluation(
  candidate: MatchingCandidate,
): RejectedCandidateEvaluation {
  return {
    status: "rejected",
    candidate,
    reasons: [
      {
        type: "STRENGTH_UNQUALIFIED",
        code: "ECT_TOO_LOW",
        message: "边压不足",
      },
    ],
    area: createArea(),
    device: createDevice(),
    strength: {
      ...createStrength(),
      isQualified: false,
      reasons: [
        {
          type: "STRENGTH_UNQUALIFIED",
          code: "ECT_TOO_LOW",
          message: "边压不足",
        },
      ],
    },
    cost: createCost(),
  };
}

describe("matching readiness check", () => {
  it("passes when paper factories, liner paper, corrugating paper, and formula parameters are ready", async () => {
    const readiness = createReadiness();

    await expect(checkReadiness(readiness)).resolves.toEqual({
      ok: true,
      data: readiness,
    });
  });

  it.each([
    [
      "paper factories",
      { hasPaperFactories: false },
      { scope: "paper_material", field: "factory", message: "缺少启用的纸厂或供应商资料" },
    ],
    [
      "liner paper",
      { hasLinerPaper: false },
      { scope: "paper_material", field: "linerboard", message: "缺少完整且启用的箱板纸资料" },
    ],
    [
      "corrugating paper",
      { hasCorrugatingPaper: false },
      { scope: "paper_material", field: "corrugating", message: "缺少完整且启用的瓦纸资料" },
    ],
    [
      "formula parameters",
      { hasFormulaParameters: false },
      { scope: "formula_parameter", field: "formulaParameters", message: "缺少基础参数资料" },
    ],
  ] as const)(
    "returns a base data field error when %s are missing",
    async (_label, overrides, missingItem) => {
      const result = await checkReadiness(createReadiness(overrides));

      expect(result).toEqual({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: MATCHING_BASE_DATA_ERROR_MESSAGE,
          details: {
            fieldErrors: [
              {
                field: "baseData",
                message: MATCHING_BASE_DATA_ERROR_MESSAGE,
              },
            ],
            missingItems: [missingItem],
          },
        },
      });
    },
  );

  it("keeps the default Drizzle readiness repository scoped to active and complete base data", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "server", "actions", "matching-readiness.ts"),
      "utf8",
    );

    expect(source).toContain("eq(paperFactories.isActive, true)");
    expect(source).toContain('this.hasActiveCompletePaperMaterial("linerboard")');
    expect(source).toContain('this.hasActiveCompletePaperMaterial("corrugating")');
    expect(source).toContain("eq(paperMaterials.paperKind, paperKind)");
    expect(source).toContain('eq(paperMaterials.completenessStatus, "complete")');
    expect(source).toContain("eq(paperMaterials.isActive, true)");
  });
});

describe("generate matching scheme action", () => {
  it("uses the paper_warehouse database adapter instead of the warehouse API or app master-data tables", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "server", "actions", "matching-actions.ts"),
      "utf8",
    );

    expect(source).toContain("WarehouseDatabaseMatchingSourceDataRepository");
    expect(source).toContain("MatchingSourceReadinessRepository");
    expect(source).toContain("MatchingSourcePaperMaterialRepository");
    expect(source).not.toContain("createDrizzleMatchingReadinessRepository(client.db)");
    expect(source).not.toContain(
      "createDrizzleListRecommendablePaperMaterialsRepository(client.db)",
    );
    expect(source).not.toContain("WAREHOUSE_API_TOKEN");
  });

  it("requires PostgreSQL configuration even when warehouse API variables exist", async () => {
    const result = await generateMatchingScheme(createValidInput(), {
      env: {
        ...validEnv,
        WAREHOUSE_API_BASE_URL: "https://warehouse.example.test",
        WAREHOUSE_API_TOKEN: "legacy-token-must-be-ignored",
      },
      cookieStore: createAuthenticatedCookieStore(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATABASE_URL_MISSING",
        message: "DATABASE_URL 未配置，需要先配置数据连接信息。",
      },
    });
  });

  it("returns a safe database error when PostgreSQL data cannot be read", async () => {
    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      readinessRepository: {
        async getMatchingReadiness() {
          throw new Error("password authentication failed postgresql://postgres:secret@localhost");
        },
      },
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATABASE_CONNECTION_FAILED",
        message: "数据库连接不可用，请检查地址、账号、密码或网络。",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("postgresql://");
  });

  it("allows unauthenticated visitors to run the matching flow", async () => {
    const readinessRepository = new InMemoryMatchingReadinessRepository(createReadiness());
    const economySlot = createRecommendationSlot("economy");
    const safetySlot = createRecommendationSlot("safety");
    const balancedSlot = createRecommendationSlot("balanced");
    const selectMatchingRecommendationsFn = vi.fn(() => ({
      slots: [economySlot, safetySlot, balancedSlot] as [
        RecommendationSlot,
        RecommendationSlot,
        RecommendationSlot,
      ],
      rejectedSummary: [],
      rejectedCandidates: [],
      globalMessages: [],
    }));

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: { get: () => undefined },
      readinessRepository,
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      createCandidates: () => [createCandidate("economy")],
      evaluateMatchingCandidatesFn: () => ({
        eligibleCandidates: [
          createEligibleEvaluation({
            candidate: createCandidate("economy"),
            costYuan: 2.13,
            bctN: 520,
          }),
        ],
        rejectedCandidates: [],
        rejectedSummary: [],
      }),
      selectMatchingRecommendationsFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(readinessRepository.callCount).toBe(1);
    expect(selectMatchingRecommendationsFn).toHaveBeenCalled();
  });

  it("returns normalized input and excludes stacking when stacking layers are blank", async () => {
    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.stackingIncluded).toBe(false);
    expect(result.data.stackingDisplayText).toBe("未填写堆码层数，承重未校核");
    expect(result.data.boxSpec.stackingRequirement.status).toBe("not_required");
  });

  it("returns normalized input and includes stacking when stacking layers are filled", async () => {
    const result = await generateMatchingScheme(createValidInput({ stackingLayers: 6 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.stackingIncluded).toBe(true);
    expect(result.data.boxSpec.stackingRequirement).toMatchObject({
      status: "required",
      stackingLayers: 6,
    });
  });

  it("returns the normal standard and cost-down slots and keeps rejected summaries", async () => {
    const economyCandidate = createCandidate("economy");
    const safetyCandidate = createCandidate("safety");
    const balancedCandidate = createCandidate("balanced");
    const deviceRejectedCandidate = createCandidate("device-rejected");
    const strengthRejectedCandidate = createCandidate("strength-rejected");
    const evaluateMatchingCandidatesFn = vi.fn().mockReturnValue({
      eligibleCandidates: [
        createEligibleEvaluation({ candidate: economyCandidate, costYuan: 2.1, bctN: 520 }),
        createEligibleEvaluation({ candidate: safetyCandidate, costYuan: 2.5, bctN: 760 }),
        createEligibleEvaluation({ candidate: balancedCandidate, costYuan: 2.3, bctN: 640 }),
      ],
      rejectedCandidates: [
        {
          status: "rejected",
          candidate: deviceRejectedCandidate,
          reasons: [
            {
              type: "NOT_MANUFACTURABLE",
              code: "BOARD_WIDTH_TOO_LARGE",
              message: "纸板宽超过设备限制",
            },
          ],
          area: createArea(),
          device: {
            isManufacturable: false,
            reasons: [
              {
                type: "NOT_MANUFACTURABLE",
                code: "BOARD_WIDTH_TOO_LARGE",
                message: "纸板宽超过设备限制",
              },
            ],
          },
        },
        createStrengthRejectedEvaluation(strengthRejectedCandidate),
      ],
      rejectedSummary: [
        { type: "NOT_MANUFACTURABLE", label: "设备不可生产", count: 1 },
        { type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 },
      ],
    });

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      createCandidates: () => [
        economyCandidate,
        safetyCandidate,
        balancedCandidate,
        deviceRejectedCandidate,
        strengthRejectedCandidate,
      ],
      evaluateMatchingCandidatesFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.recommendationSlots).toHaveLength(2);
    expect(result.data.recommendationSlots.map((slot) => slot.title)).toEqual([
      "标准方案",
      "降本方案",
    ]);
    expect(result.data.recommendationSlots[0]?.isOfficialRecommendation).toBe(true);
    expect(result.data.recommendationMessages).toEqual([]);
    const serializedResult = JSON.stringify(result.data);
    expect(serializedResult).not.toContain("historicalHabitScore");
    expect(serializedResult).not.toContain("historicalReason");
    expect(serializedResult).not.toContain("aiReason");
    expect(serializedResult).not.toContain("aiGeneratedReason");
    expect(result.data.rejectedCandidates).toHaveLength(2);
    expect(result.data.rejectedSummary).toEqual([
      { type: "NOT_MANUFACTURABLE", label: "设备不可生产", count: 1 },
      { type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 },
    ]);
    expect(evaluateMatchingCandidatesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [
          economyCandidate,
          safetyCandidate,
          balancedCandidate,
          deviceRejectedCandidate,
          strengthRejectedCandidate,
        ],
      }),
    );
  });

  it("caps rejected candidate details returned to the client while keeping summaries", async () => {
    const rejectedCandidates = Array.from({ length: 50 }, (_, index) =>
      createStrengthRejectedEvaluation(createCandidate(`strength-rejected-${index}`)),
    );
    const evaluateMatchingCandidatesFn = vi.fn().mockReturnValue({
      eligibleCandidates: [
        createEligibleEvaluation({
          candidate: createCandidate("eligible"),
          costYuan: 2.1,
          bctN: 520,
        }),
      ],
      rejectedCandidates,
      rejectedSummary: [{ type: "STRENGTH_UNQUALIFIED", label: "strength rejected", count: 50 }],
    });

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      createCandidates: () => [createCandidate("eligible")],
      evaluateMatchingCandidatesFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.rejectedSummary).toEqual([
      { type: "STRENGTH_UNQUALIFIED", label: "strength rejected", count: 50 },
    ]);
    expect(result.data.rejectedCandidates).toHaveLength(20);
    expect(result.data.rejectedCandidates[0]?.candidate.id).toBe("strength-rejected-0");
  });

  it("keeps default candidate expansion bounded for large paper libraries", async () => {
    const liners = Array.from({ length: 50 }, (_, index) =>
      createRecommendablePaperMaterial(`liner-${index}`, {
        paperKind: "linerboard",
        grade: index % 3 === 0 ? "优等品" : index % 3 === 1 ? "一等品" : "合格品",
        gramWeightGsm: 100 + index * 5,
        priceYuanPerTon: 3000 + index * 8,
        burstIndex: 8 + index * 0.2,
        ringCrushIndex: 18 + index * 0.3,
      }),
    );
    const corrugatings = Array.from({ length: 20 }, (_, index) =>
      createRecommendablePaperMaterial(`corrugating-${index}`, {
        paperKind: "corrugating",
        grade: index % 3 === 0 ? "优等品" : index % 3 === 1 ? "一等品" : "合格品",
        gramWeightGsm: 80 + index * 5,
        applicableFlutes: ["A", "B", "C", "E"],
        priceYuanPerTon: 2600 + index * 6,
        ringCrushIndex: 14 + index * 0.25,
      }),
    );
    const observedCandidateCounts: number[] = [];
    const evaluateMatchingCandidatesFn = vi.fn(
      ({ candidates }: { candidates: MatchingCandidate[] }) => {
        observedCandidateCounts.push(candidates.length);

        return {
          eligibleCandidates: [
            createEligibleEvaluation({
              candidate: candidates[0] ?? createCandidate("fallback"),
              costYuan: 2.13,
              bctN: 520,
            }),
          ],
          rejectedCandidates: [],
          rejectedSummary: [],
        };
      },
    );

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository([...liners, ...corrugatings]),
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(observedCandidateCounts[0]).toBeGreaterThan(0);
    expect(observedCandidateCounts[0]).toBeLessThanOrEqual(
      36 * 36 * 20 * 4 + 16 * 16 * 8 * 12 * 12 * 5,
    );
    expect(observedCandidateCounts[0]).toBeLessThan(50 * 50 * 50 * 20 * 20 * 16);
  });

  it("keeps common five-layer liner weights in default candidates", async () => {
    const lowWeightLiners = Array.from({ length: 12 }, (_, index) =>
      createRecommendablePaperMaterial(`low-liner-${index}`, {
        paperKind: "linerboard",
        gramWeightGsm: 100 + index * 5,
        priceYuanPerTon: 2800 + index,
        burstIndex: 30 - index * 0.1,
        ringCrushIndex: 40 - index * 0.1,
      }),
    );
    const commonLiners = [
      createRecommendablePaperMaterial("common-liner-190", {
        paperKind: "linerboard",
        gramWeightGsm: 190,
        priceYuanPerTon: 3600,
        burstIndex: 8,
        ringCrushIndex: 18,
      }),
      createRecommendablePaperMaterial("common-liner-200", {
        paperKind: "linerboard",
        gramWeightGsm: 200,
        priceYuanPerTon: 3650,
        burstIndex: 8,
        ringCrushIndex: 18,
      }),
      createRecommendablePaperMaterial("common-liner-250", {
        paperKind: "linerboard",
        gramWeightGsm: 250,
        priceYuanPerTon: 3800,
        burstIndex: 8,
        ringCrushIndex: 18,
      }),
    ];
    const corrugatings = [
      createRecommendablePaperMaterial("corrugating-b", {
        paperKind: "corrugating",
        gramWeightGsm: 140,
        applicableFlutes: ["B"],
      }),
      createRecommendablePaperMaterial("corrugating-c", {
        paperKind: "corrugating",
        gramWeightGsm: 140,
        applicableFlutes: ["C"],
      }),
    ];
    let observedCandidates: MatchingCandidate[] = [];
    const evaluateMatchingCandidatesFn = vi.fn(({ candidates }) => {
      observedCandidates = candidates;

      return {
        eligibleCandidates: [
          createEligibleEvaluation({
            candidate: candidates[0] ?? createCandidate("fallback"),
            costYuan: 2.13,
            bctN: 520,
          }),
        ],
        rejectedCandidates: [],
        rejectedSummary: [],
      };
    });

    const result = await generateMatchingScheme(createValidInput({ productWeightKg: 25 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository([
        ...lowWeightLiners,
        ...commonLiners,
        ...corrugatings,
      ]),
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(
      observedCandidates.some(
        (candidate) =>
          candidate.layerCount === 5 &&
          candidate.layers.some(
            (layer) => layer.role === "outer_liner" && layer.paper.gramWeightGsm === 190,
          ) &&
          candidate.layers.some(
            (layer) => layer.role === "inner_liner" && layer.paper.gramWeightGsm === 190,
          ),
      ),
    ).toBe(true);
    expect(
      observedCandidates.some(
        (candidate) =>
          candidate.layerCount === 5 &&
          candidate.layers.some((layer) => layer.paper.gramWeightGsm === 200),
      ),
    ).toBe(true);
    expect(
      observedCandidates.some(
        (candidate) =>
          candidate.layerCount === 5 &&
          candidate.layers.some((layer) => layer.paper.gramWeightGsm === 250),
      ),
    ).toBe(true);
  });

  it("generates five-layer candidates from the current paper library", async () => {
    let observedCandidates: MatchingCandidate[] = [];
    const evaluateMatchingCandidatesFn = vi.fn(({ candidates }) => {
      observedCandidates = candidates;

      return {
        eligibleCandidates: [
          createEligibleEvaluation({
            candidate: candidates[0] ?? createCandidate("fallback"),
            costYuan: 2.13,
            bctN: 520,
          }),
        ],
        rejectedCandidates: [],
        rejectedSummary: [],
      };
    });

    const result = await generateMatchingScheme(createValidInput({ productWeightKg: 25 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository([
        createRecommendablePaperMaterial("outer-230", {
          paperKind: "linerboard",
          gramWeightGsm: 230,
        }),
        createRecommendablePaperMaterial("inner-200", {
          paperKind: "linerboard",
          gramWeightGsm: 200,
        }),
        createRecommendablePaperMaterial("medium-120", {
          paperKind: "linerboard",
          gramWeightGsm: 120,
        }),
        createRecommendablePaperMaterial("corrugating-b", {
          paperKind: "corrugating",
          gramWeightGsm: 140,
          applicableFlutes: ["B"],
        }),
        createRecommendablePaperMaterial("corrugating-c", {
          paperKind: "corrugating",
          gramWeightGsm: 140,
          applicableFlutes: ["C"],
        }),
      ]),
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(observedCandidates.some((candidate) => candidate.layerCount === 5)).toBe(true);
    expect(
      observedCandidates.some(
        (candidate) =>
          candidate.layerCount === 5 &&
          candidate.layers.some((layer) => layer.role === "medium") &&
          candidate.layers.filter((layer) => layer.role === "corrugating").length === 2,
      ),
    ).toBe(true);
  });

  it("only generates candidates whose outer liner is not lighter than the inner liner and stays within 20g", async () => {
    let observedCandidates: MatchingCandidate[] = [];
    const evaluateMatchingCandidatesFn = vi.fn(({ candidates }) => {
      observedCandidates = candidates;

      return {
        eligibleCandidates: [
          createEligibleEvaluation({
            candidate: candidates[0] ?? createCandidate("fallback"),
            costYuan: 2.13,
            bctN: 520,
          }),
        ],
        rejectedCandidates: [],
        rejectedSummary: [],
      };
    });

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository([
        createRecommendablePaperMaterial("liner-190", {
          paperKind: "linerboard",
          gramWeightGsm: 190,
        }),
        createRecommendablePaperMaterial("liner-200", {
          paperKind: "linerboard",
          gramWeightGsm: 200,
        }),
        createRecommendablePaperMaterial("liner-230", {
          paperKind: "linerboard",
          gramWeightGsm: 230,
        }),
        createRecommendablePaperMaterial("corrugating-b", {
          paperKind: "corrugating",
          gramWeightGsm: 140,
          applicableFlutes: ["B"],
        }),
      ]),
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(observedCandidates.length).toBeGreaterThan(0);
    expect(observedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringContaining("liner-200") }),
      ]),
    );
    expect(observedCandidates).toEqual(
      observedCandidates.filter((candidate) => {
        const outerWeight = candidate.layers.find((layer) => layer.role === "outer_liner")?.paper
          .gramWeightGsm;
        const innerWeight = candidate.layers.find((layer) => layer.role === "inner_liner")?.paper
          .gramWeightGsm;

        return (
          typeof outerWeight === "number" &&
          typeof innerWeight === "number" &&
          outerWeight >= innerWeight &&
          outerWeight - innerWeight <= 20
        );
      }),
    );
  });

  it("filters matching candidates to five-layer when product weight is above 20kg", async () => {
    let observedCandidates: MatchingCandidate[] = [];
    const threeLayerCandidate = createCandidate("three-layer");
    const fiveLayerCandidate = createFiveLayerCandidate("five-layer");
    const evaluateMatchingCandidatesFn = vi.fn(
      ({ candidates }: { candidates: MatchingCandidate[] }) => {
        observedCandidates = candidates;

        return {
          eligibleCandidates: candidates.map((candidate, index) =>
            createEligibleEvaluation({
              candidate,
              costYuan: 2.13 + index,
              bctN: candidate.layerCount === 5 ? 900 : 520,
            }),
          ),
          rejectedCandidates: [],
          rejectedSummary: [],
        };
      },
    );

    const result = await generateMatchingScheme(createValidInput({ productWeightKg: 25 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      createCandidates: () => [threeLayerCandidate, fiveLayerCandidate],
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(observedCandidates.map((candidate) => candidate.layerCount)).toEqual([5]);
  });

  it("generates seven-layer BAC candidates for product weight above 30kg", async () => {
    let observedCandidates: MatchingCandidate[] = [];
    const evaluateMatchingCandidatesFn = vi.fn(({ candidates }) => {
      observedCandidates = candidates;

      return {
        eligibleCandidates: [
          createEligibleEvaluation({
            candidate: candidates[0] ?? createCandidate("fallback"),
            costYuan: 3.45,
            bctN: 1300,
          }),
        ],
        rejectedCandidates: [],
        rejectedSummary: [],
      };
    });

    const result = await generateMatchingScheme(createValidInput({ productWeightKg: 31 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository([
        createRecommendablePaperMaterial("outer-250", {
          paperKind: "linerboard",
          gramWeightGsm: 250,
        }),
        createRecommendablePaperMaterial("inner-250", {
          paperKind: "linerboard",
          gramWeightGsm: 250,
        }),
        createRecommendablePaperMaterial("medium-120", {
          paperKind: "linerboard",
          gramWeightGsm: 120,
        }),
        createRecommendablePaperMaterial("corrugating-b", {
          paperKind: "corrugating",
          gramWeightGsm: 150,
          applicableFlutes: ["B"],
        }),
        createRecommendablePaperMaterial("corrugating-a", {
          paperKind: "corrugating",
          gramWeightGsm: 150,
          applicableFlutes: ["A"],
        }),
        createRecommendablePaperMaterial("corrugating-c", {
          paperKind: "corrugating",
          gramWeightGsm: 150,
          applicableFlutes: ["C"],
        }),
      ]),
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(observedCandidates.length).toBeGreaterThan(0);
    expect(observedCandidates.every((candidate) => candidate.layerCount === 7)).toBe(true);
    expect(
      observedCandidates.some(
        (candidate) => candidate.layerCount === 7 && candidate.fluteType === "BAC",
      ),
    ).toBe(true);
  });

  it("attaches template selection reasons to every recommendation slot by default", async () => {
    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.recommendationSlots).toHaveLength(3);
    expect(
      result.data.recommendationSlots.every(
        (slot) =>
          slot.selectionReason?.sourceLabel === "模板生成" && slot.selectionReason.text.length > 0,
      ),
    ).toBe(true);
  });

  it("uses AI generated selection reasons when the provider succeeds", async () => {
    const provider: AiReasoningProvider = {
      async generateSelectionReason({ facts }) {
        return {
          text: `该${facts.strategyLabel}方案成本较低，强度满足要求，可生产。`,
        };
      },
    };

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      aiReasoningProvider: provider,
      aiReasoningRepository: createInMemoryAiReasoningRepository(),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(
      result.data.recommendationSlots.map((slot) => slot.selectionReason?.sourceLabel),
    ).toEqual(["AI 生成", "AI 生成", "AI 生成"]);
    expect(result.data.recommendationSlots[0]!.selectionReason?.text).toContain("经济型");
  });

  it("uses the configured AI provider from environment variables", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "test-model",
            output_text: "该方案成本较低，强度满足要求，可生产。",
          }),
          { status: 200 },
        ),
    );

    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await generateMatchingScheme(createValidInput(), {
        env: {
          ...validEnv,
          AI_PROVIDER_API_KEY: "test-key",
          AI_PROVIDER_BASE_URL: "https://ai.example/v1",
          AI_REASONING_MODEL: "test-model",
          AI_REASONING_TIMEOUT_MS: "1500",
          AI_REASONING_DAILY_LIMIT: "100",
        },
        cookieStore: createAuthenticatedCookieStore(),
        readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
        paperMaterialRepository: new InMemoryPaperMaterialRepository(),
        selectMatchingRecommendationsFn: () => ({
          slots: [
            createRecommendationSlot("economy"),
            createRecommendationSlot("safety"),
            createRecommendationSlot("balanced"),
          ],
          rejectedSummary: [],
          rejectedCandidates: [],
          globalMessages: [],
        }),
        now: new Date("2026-07-04T00:00:00.000Z"),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("matching action should succeed");
      }

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        result.data.recommendationSlots.map((slot) => slot.selectionReason?.sourceLabel),
      ).toEqual(["AI 生成", "AI 生成", "AI 生成"]);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://ai.example/v1/responses");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer test-key",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps matching result successful and falls back to template when provider fails", async () => {
    const provider: AiReasoningProvider = {
      async generateSelectionReason() {
        throw new Error("provider failed");
      },
    };

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      aiReasoningProvider: provider,
      aiReasoningRepository: createInMemoryAiReasoningRepository(),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(
      result.data.recommendationSlots.map((slot) => slot.selectionReason?.fallbackReason),
    ).toEqual(["provider_failed", "provider_failed", "provider_failed"]);
  });

  it("does not call provider and falls back to template when daily limit is reached", async () => {
    const provider: AiReasoningProvider = {
      generateSelectionReason: vi.fn(async () => ({
        text: "该经济型方案成本较低，强度满足要求，可生产。",
      })),
    };

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      aiReasoningProvider: provider,
      aiReasoningRepository: createInMemoryAiReasoningRepository({
        dailyUsages: {
          "2026-07-04": 100,
        },
      }),
      aiReasoningOptions: { dailyLimit: 100 },
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(provider.generateSelectionReason).not.toHaveBeenCalled();
    expect(
      result.data.recommendationSlots.map((slot) => slot.selectionReason?.fallbackReason),
    ).toEqual(["daily_limit_reached", "daily_limit_reached", "daily_limit_reached"]);
  });

  it("creates template reasons for unavailable slots without calling provider for that slot", async () => {
    const provider: AiReasoningProvider = {
      generateSelectionReason: vi.fn(async ({ facts }) => ({
        text: `该${facts.strategyLabel}方案成本较低，强度满足要求，可生产。`,
      })),
    };
    const economySlot = createRecommendationSlot("economy");
    const unavailableSlot: RecommendationSlot = {
      strategy: "safety",
      title: "安全型" as RecommendationSlot["title"],
      status: "unavailable",
      isOfficialRecommendation: false,
      messages: [],
      unavailableReasons: [
        {
          type: "PARAMETER_ERROR",
          code: "NO_SAFETY_CANDIDATE",
          message: "没有可展示的参考方案",
        },
      ],
    };

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [economySlot, unavailableSlot, createRecommendationSlot("balanced")],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      aiReasoningProvider: provider,
      aiReasoningRepository: createInMemoryAiReasoningRepository(),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(provider.generateSelectionReason).toHaveBeenCalledTimes(2);
    expect(result.data.recommendationSlots[1]).toMatchObject({
      strategy: "safety",
      status: "unavailable",
      isOfficialRecommendation: false,
      selectionReason: expect.objectContaining({
        sourceLabel: "模板生成",
        text: expect.stringContaining("没有可展示的参考方案"),
      }),
    });
  });

  it("does not let selection reasons change recommendation slot ordering or metrics", async () => {
    const economy = createRecommendationSlot("economy");
    const safety = createRecommendationSlot("safety");
    const balanced = createRecommendationSlot("balanced");

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      selectMatchingRecommendationsFn: () => ({
        slots: [economy, safety, balanced],
        rejectedSummary: [],
        rejectedCandidates: [],
        globalMessages: [],
      }),
      aiReasoningProvider: {
        async generateSelectionReason({ facts }) {
          return {
            text: `该${facts.strategyLabel}方案成本较低，强度满足要求，可生产。`,
          };
        },
      },
      aiReasoningRepository: createInMemoryAiReasoningRepository(),
      now: new Date("2026-07-04T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.recommendationSlots.map((slot) => slot.strategy)).toEqual([
      "economy",
      "safety",
      "balanced",
    ]);
    expect(result.data.recommendationSlots[0]!.evaluation?.cost?.taxIncludedCostYuan).toBe(
      economy.evaluation?.cost?.taxIncludedCostYuan,
    );
    expect(result.data.recommendationSlots[1]!.evaluation?.strength?.bctN).toBe(
      safety.evaluation?.strength?.bctN,
    );
    expect(result.data.recommendationSlots[2]!.status).toBe(balanced.status);
  });

  it("returns recommendation messages when no candidate is eligible", async () => {
    const rejectedCandidate = createCandidate("strength-rejected");
    const evaluateMatchingCandidatesFn = vi.fn().mockReturnValue({
      eligibleCandidates: [],
      rejectedCandidates: [createStrengthRejectedEvaluation(rejectedCandidate)],
      rejectedSummary: [{ type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 }],
    });

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      paperMaterialRepository: new InMemoryPaperMaterialRepository(),
      createCandidates: () => [rejectedCandidate],
      evaluateMatchingCandidatesFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.recommendationMessages).toContain(
      "当前没有达标可生产方案，以下仅供调整参考",
    );
    expect(result.data.recommendationSlots).toHaveLength(2);
    expect(result.data.recommendationSlots.some((slot) => slot.status === "reference")).toBe(true);
    expect(result.data.recommendationSlots.every((slot) => !slot.isOfficialRecommendation)).toBe(
      true,
    );
  });

  it("does not read papers or evaluate candidates when readiness checks fail", async () => {
    const paperMaterialRepository = new InMemoryPaperMaterialRepository();
    const evaluateMatchingCandidatesFn = vi.fn();
    const selectMatchingRecommendationsFn = vi.fn();

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(
        createReadiness({ hasFormulaParameters: false }),
      ),
      paperMaterialRepository,
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    expect(paperMaterialRepository.callCount).toBe(0);
    expect(evaluateMatchingCandidatesFn).not.toHaveBeenCalled();
    expect(selectMatchingRecommendationsFn).not.toHaveBeenCalled();
  });

  it("returns field errors and skips readiness checks when required input is missing", async () => {
    const readinessRepository = new InMemoryMatchingReadinessRepository(createReadiness());
    const paperMaterialRepository = new InMemoryPaperMaterialRepository();
    const evaluateMatchingCandidatesFn = vi.fn();
    const selectMatchingRecommendationsFn = vi.fn();

    const result = await generateMatchingScheme(createValidInput({ lengthMm: "" }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository,
      paperMaterialRepository,
      evaluateMatchingCandidatesFn,
      selectMatchingRecommendationsFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请检查纸箱输入",
        details: {
          fieldErrors: [
            {
              field: "lengthMm",
              message: "纸箱内长不能为空",
            },
          ],
        },
      },
    });
    expect(readinessRepository.callCount).toBe(0);
    expect(paperMaterialRepository.callCount).toBe(0);
    expect(evaluateMatchingCandidatesFn).not.toHaveBeenCalled();
    expect(selectMatchingRecommendationsFn).not.toHaveBeenCalled();
  });

  it("returns a field error when length is smaller than width", async () => {
    const result = await generateMatchingScheme(createValidInput({ lengthMm: 300, widthMm: 500 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("matching action should fail");
    }

    expect(result.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "请检查纸箱输入",
    });
    expect(result.error.details?.fieldErrors).toEqual(
      expect.arrayContaining([
        {
          field: "lengthMm",
          message: "纸箱内长必须大于或等于内宽",
        },
      ]),
    );
  });

  it("returns a field error when stacking layers exceed the allowed range", async () => {
    const result = await generateMatchingScheme(createValidInput({ stackingLayers: 31 }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("matching action should fail");
    }

    expect(result.error.details?.fieldErrors).toEqual(
      expect.arrayContaining([
        {
          field: "stackingLayers",
          message: "堆码层数允许范围为 1-30 层",
        },
      ]),
    );
  });

  it("returns a safe base data error when readiness checks fail", async () => {
    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(
        createReadiness({ hasFormulaParameters: false }),
      ),
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: MATCHING_BASE_DATA_ERROR_MESSAGE,
        details: {
          fieldErrors: [
            {
              field: "baseData",
              message: MATCHING_BASE_DATA_ERROR_MESSAGE,
            },
          ],
          missingItems: [
            {
              scope: "formula_parameter",
              field: "formulaParameters",
              message: "缺少基础参数资料",
            },
          ],
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("SELECT");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("keeps generateMatchingScheme on the shared ActionResult contract", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "server", "actions", "matching-actions.ts"),
      "utf8",
    );

    expect(source).toContain("Promise<ActionResult<GenerateMatchingSchemeResult>>");
  });

  it("does not save generated recommendations before the user confirms", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();

    await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
      historyRepository,
      now: new Date("2026-07-02T00:00:00.000Z"),
    });

    expect(historyRepository.records).toHaveLength(0);
  });
});

describe("save confirmed matching scheme action", () => {
  it("saves a selected system recommendation with a valid generation token", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const trustedEvaluation = createEligibleEvaluation({
      candidate: createCandidate("economy"),
      costYuan: 2.13,
      bctN: 520,
    });
    const selectedSelectionReason = createStoredSelectionReason(
      "AI 生成",
      "保存时的经济型 AI 理由",
    );
    const createSelectionReasonFn = vi.fn(async () =>
      createStoredSelectionReason("模板生成", "不应重新生成未调整理由"),
    );
    const originalRecommendationSlots = [
      {
        ...createRecommendationSlot(
          "economy",
          createEligibleEvaluation({
            candidate: createCandidate("economy"),
            costYuan: 0.01,
            bctN: 520,
          }),
        ),
        selectionReason: selectedSelectionReason,
      },
      {
        ...createRecommendationSlot("safety"),
        selectionReason: createStoredSelectionReason("模板生成", "安全型原始理由"),
      },
      {
        ...createRecommendationSlot("balanced"),
        selectionReason: createStoredSelectionReason("模板生成", "均衡型原始理由"),
      },
    ];

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots,
        selectedStrategy: "economy",
        generationToken: createValidGenerationToken(originalRecommendationSlots),
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        evaluateCandidateFn: () => trustedEvaluation,
        createSelectionReasonFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        schemeId: "scheme-1",
        finalStatus: "qualified",
        isManuallyAdjusted: false,
        warningMessages: [],
        savedAt: "2026-07-02T00:00:00.000Z",
      },
    });
    expect(historyRepository.records).toHaveLength(1);
    expect(historyRepository.records[0]).toMatchObject({
      boxSpecSnapshot: expect.objectContaining({ productionQuantity: 1000 }),
      originalRecommendationSlotsSnapshot: expect.arrayContaining([
        expect.objectContaining({
          strategy: "economy",
          evaluation: expect.objectContaining({
            cost: expect.objectContaining({ taxIncludedCostYuan: 0.01 }),
          }),
          selectionReason: selectedSelectionReason,
        }),
      ]),
      finalSchemeSnapshot: expect.objectContaining({
        finalStatus: "qualified",
        cost: expect.objectContaining({ taxIncludedCostYuan: 2.13 }),
        selectionReason: selectedSelectionReason,
      }),
      priceSnapshot: expect.arrayContaining([
        expect.objectContaining({
          paperMaterialId: "economy-outer",
          paperCode: "economy-P1",
          gramWeightGsm: 200,
          priceYuanPerTon: 3000,
          burstIndex: 10,
          ringCrushIndex: 20,
        }),
      ]),
      parameterVersion: "prd-v1-default",
      isManuallyAdjusted: false,
      exportRecords: [],
      confirmedBy: "operator",
    });
    expect(createSelectionReasonFn).not.toHaveBeenCalled();
  });
  it("allows unauthenticated visitors to save confirmed history", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const originalRecommendationSlots = [
      createRecommendationSlot("economy"),
      createRecommendationSlot("safety"),
      createRecommendationSlot("balanced"),
    ];
    const evaluateCandidateFn = vi.fn(() =>
      createEligibleEvaluation({
        candidate: createCandidate("economy"),
        costYuan: 2.13,
        bctN: 520,
      }),
    );

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots,
        selectedStrategy: "economy",
        generationToken: createValidGenerationToken(originalRecommendationSlots),
      },
      {
        env: validEnv,
        cookieStore: { get: () => undefined },
        historyRepository,
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result.ok).toBe(true);
    expect(evaluateCandidateFn).toHaveBeenCalled();
    expect(historyRepository.records).toHaveLength(1);
  });
});
