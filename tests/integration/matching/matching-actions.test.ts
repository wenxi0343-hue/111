import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { BoxSpecInput } from "@/modules/box-spec/types";
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
import {
  MATCHING_BASE_DATA_ERROR_MESSAGE,
  checkMatchingReadinessFromRepository,
  type MatchingReadiness,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import {
  generateMatchingScheme,
  recalculateAdjustedScheme,
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

function createStrengthRejectedEvaluation(candidate: MatchingCandidate): RejectedCandidateEvaluation {
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

function createDeviceRejectedEvaluation(candidate: MatchingCandidate): RejectedCandidateEvaluation {
  return {
    status: "rejected",
    candidate,
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
  };
}

function createDataMissingEvaluation(candidate: MatchingCandidate): RejectedCandidateEvaluation {
  return {
    status: "rejected",
    candidate,
    reasons: [
      {
        type: "DATA_MISSING",
        code: "PAPER_PRICE_MISSING",
        message: "缺少原纸价格",
      },
    ],
    area: createArea(),
    device: createDevice(),
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
    ["paper factories", { hasPaperFactories: false }],
    ["liner paper", { hasLinerPaper: false }],
    ["corrugating paper", { hasCorrugatingPaper: false }],
    ["formula parameters", { hasFormulaParameters: false }],
  ] as const)("returns a base data field error when %s are missing", async (_label, overrides) => {
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
        },
      },
    });
  });

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
  it("requires authentication before running the matching flow", async () => {
    const readinessRepository = new InMemoryMatchingReadinessRepository(createReadiness());
    const selectMatchingRecommendationsFn = vi.fn();

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: { get: () => undefined },
      readinessRepository,
      selectMatchingRecommendationsFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(readinessRepository.callCount).toBe(0);
    expect(selectMatchingRecommendationsFn).not.toHaveBeenCalled();
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

  it("returns three recommendation slots and keeps rejected summaries", async () => {
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

    expect(result.data.recommendationSlots).toHaveLength(3);
    expect(result.data.recommendationSlots.map((slot) => slot.title)).toEqual([
      "经济型",
      "安全型",
      "均衡型",
    ]);
    expect(result.data.recommendationSlots.every((slot) => slot.isOfficialRecommendation)).toBe(
      true,
    );
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
    expect(result.data.recommendationSlots).toHaveLength(3);
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
              message: "纸箱长度不能为空",
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
    const result = await generateMatchingScheme(
      createValidInput({ lengthMm: 300, widthMm: 500 }),
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        readinessRepository: new InMemoryMatchingReadinessRepository(createReadiness()),
        now: new Date("2026-07-01T00:00:00.000Z"),
      },
    );

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
          message: "纸箱长度必须大于或等于宽度",
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

describe("recalculate adjusted matching scheme action", () => {
  it("recalculates an adjusted scheme with current paper data and returns qualified status", async () => {
    const evaluateCandidateFn = vi.fn((input) =>
      createEligibleEvaluation({
        candidate: input.candidate,
        costYuan: 2.45,
        bctN: 900,
      }),
    );

    const result = await recalculateAdjustedScheme(
      {
        boxSpec: createValidInput(),
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layers: [
            { role: "outer_liner", paperMaterialId: "paper-b" },
            { role: "corrugating", flute: "B", paperMaterialId: "paper-c" },
            { role: "inner_liner", paperMaterialId: "paper-d" },
          ],
        },
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialRepository: new InMemoryPaperMaterialRepository([
          createRecommendablePaperMaterial("paper-b", {
            paperCode: "B",
            gramWeightGsm: 250,
            priceYuanPerTon: 4100,
            burstIndex: 14,
            ringCrushIndex: 28,
          }),
          createRecommendablePaperMaterial("paper-c", {
            paperKind: "corrugating",
            paperCode: "C",
          }),
          createRecommendablePaperMaterial("paper-d", { paperCode: "D" }),
        ]),
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        finalStatus: "qualified",
        isManuallyAdjusted: true,
        warningMessages: [],
        canSave: true,
        finalEvaluation: {
          status: "eligible",
          cost: expect.objectContaining({ taxIncludedCostYuan: 2.45 }),
          strength: expect.objectContaining({ bctN: 900 }),
        },
      },
    });
    expect(evaluateCandidateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          layers: expect.arrayContaining([
            expect.objectContaining({
              role: "outer_liner",
              paper: expect.objectContaining({
                id: "paper-b",
                priceYuanPerTon: 4100,
                burstIndex: 14,
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("maps strength rejected recalculation to unqualified", async () => {
    const result = await recalculateAdjustedScheme(
      {
        boxSpec: createValidInput(),
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layerCount: 5,
          fluteType: "BC",
        },
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialRepository: new InMemoryPaperMaterialRepository(),
        evaluateCandidateFn: ({ candidate }) => createStrengthRejectedEvaluation(candidate),
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        finalStatus: "unqualified",
        warningMessages: ["最终方案未达标，不建议生产"],
        canSave: false,
      },
    });
  });

  it("maps device rejected recalculation to not manufacturable", async () => {
    const result = await recalculateAdjustedScheme(
      {
        boxSpec: createValidInput(),
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layerCount: 5,
          fluteType: "BC",
        },
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialRepository: new InMemoryPaperMaterialRepository(),
        evaluateCandidateFn: ({ candidate }) => createDeviceRejectedEvaluation(candidate),
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        finalStatus: "not_manufacturable",
        warningMessages: ["最终方案不可生产，不建议生产"],
        canSave: false,
      },
    });
  });

  it("returns DATA_NOT_FOUND when adjusted paper does not exist", async () => {
    const evaluateCandidateFn = vi.fn();

    const result = await recalculateAdjustedScheme(
      {
        boxSpec: createValidInput(),
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layers: [{ role: "outer_liner", paperMaterialId: "missing-paper" }],
        },
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialRepository: new InMemoryPaperMaterialRepository(),
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DATA_NOT_FOUND",
        message: "调整后的原纸不存在或已停用",
      },
    });
    expect(evaluateCandidateFn).not.toHaveBeenCalled();
  });
});

describe("save confirmed matching scheme action", () => {
  it("saves an unadjusted selected final scheme with original three recommendations", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const trustedEvaluation = createEligibleEvaluation({
      candidate: createCandidate("economy"),
      costYuan: 2.13,
      bctN: 520,
    });

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [
          createRecommendationSlot(
            "economy",
            createEligibleEvaluation({
              candidate: createCandidate("economy"),
              costYuan: 0.01,
              bctN: 520,
            }),
          ),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        clientState: "recalculated",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        evaluateCandidateFn: () => trustedEvaluation,
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
        }),
      ]),
      finalSchemeSnapshot: expect.objectContaining({
        finalStatus: "qualified",
        cost: expect.objectContaining({ taxIncludedCostYuan: 2.13 }),
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
  });

  it("saves an adjusted final scheme with current paper data and marks manual adjustment", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const baseCandidate = createCandidate("economy");
    const evaluateCandidateFn = vi.fn((input) =>
      createEligibleEvaluation({
        candidate: input.candidate,
        costYuan: 2.45,
        bctN: 900,
      }),
    );

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        selectedStrategy: "economy",
        baseCandidate,
        adjustments: {
          layerCount: 5,
          fluteType: "BC",
          layers: [
            { role: "outer_liner", paperMaterialId: "paper-b" },
            { role: "corrugating", flute: "B", paperMaterialId: "paper-c" },
            { role: "inner_liner", paperMaterialId: "paper-d" },
          ],
        },
        clientState: "recalculated",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        paperMaterialRepository: new InMemoryPaperMaterialRepository([
          createRecommendablePaperMaterial("paper-b", {
            paperCode: "B",
            gramWeightGsm: 250,
            priceYuanPerTon: 4100,
            burstIndex: 14,
            ringCrushIndex: 28,
          }),
          createRecommendablePaperMaterial("paper-c", {
            paperKind: "corrugating",
            paperCode: "C",
          }),
          createRecommendablePaperMaterial("paper-d", { paperCode: "D" }),
        ]),
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        schemeId: "scheme-1",
        finalStatus: "qualified",
        isManuallyAdjusted: true,
        warningMessages: [],
        savedAt: "2026-07-02T00:00:00.000Z",
      },
    });
    expect(historyRepository.records).toHaveLength(1);
    expect(historyRepository.records[0]).toMatchObject({
      originalRecommendationSlotsSnapshot: expect.arrayContaining([
        expect.objectContaining({
          strategy: "economy",
          evaluation: expect.objectContaining({
            candidate: expect.objectContaining({
              layers: expect.arrayContaining([
                expect.objectContaining({
                  paper: expect.objectContaining({ id: "economy-outer" }),
                }),
              ]),
            }),
          }),
        }),
      ]),
      finalSchemeSnapshot: expect.objectContaining({
        finalStatus: "qualified",
        candidate: expect.objectContaining({
          layerCount: 5,
          fluteType: "BC",
          layers: expect.arrayContaining([
            expect.objectContaining({
              role: "outer_liner",
              paper: expect.objectContaining({
                id: "paper-b",
                priceYuanPerTon: 4100,
                burstIndex: 14,
              }),
            }),
          ]),
        }),
        cost: expect.objectContaining({ taxIncludedCostYuan: 2.45 }),
        strength: expect.objectContaining({ bctN: 900 }),
      }),
      priceSnapshot: expect.arrayContaining([
        expect.objectContaining({
          paperMaterialId: "paper-b",
          paperCode: "B",
          priceYuanPerTon: 4100,
        }),
      ]),
      isManuallyAdjusted: true,
    });
    expect(evaluateCandidateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({
          layerCount: 5,
          fluteType: "BC",
        }),
      }),
    );
  });

  it("rejects dirty adjusted save requests and does not write history", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const evaluateCandidateFn = vi.fn();

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layerCount: 5,
          fluteType: "BC",
        },
        clientState: "dirty",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先重新校核后再保存",
      },
    });
    expect(evaluateCandidateFn).not.toHaveBeenCalled();
    expect(historyRepository.records).toHaveLength(0);
  });

  it("uses server recalculation instead of stale adjusted client metrics when saving", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        adjustments: {
          layerCount: 5,
          fluteType: "BC",
        },
        clientState: "recalculated",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        paperMaterialRepository: new InMemoryPaperMaterialRepository(),
        evaluateCandidateFn: ({ candidate }) =>
          createEligibleEvaluation({ candidate, costYuan: 9.99, bctN: 1200 }),
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        finalStatus: "qualified",
        isManuallyAdjusted: true,
      },
    });
    expect(historyRepository.records[0]?.finalSchemeSnapshot).toMatchObject({
      cost: expect.objectContaining({ taxIncludedCostYuan: 9.99 }),
      strength: expect.objectContaining({ bctN: 1200 }),
      candidate: expect.objectContaining({
        layerCount: 5,
        fluteType: "BC",
      }),
    });
  });

  it.each([
    {
      label: "strength rejected",
      createEvaluation: createStrengthRejectedEvaluation,
    },
    {
      label: "device rejected",
      createEvaluation: createDeviceRejectedEvaluation,
    },
    {
      label: "data missing",
      createEvaluation: createDataMissingEvaluation,
    },
  ] as const)(
    "rejects $label adjusted schemes and does not write history",
    async ({ createEvaluation }) => {
      const historyRepository = new InMemoryMatchingSchemeHistoryRepository();

      const result = await saveConfirmedMatchingScheme(
        {
          boxSpec: createValidInput(),
          originalRecommendationSlots: [
            createRecommendationSlot("economy"),
            createRecommendationSlot("safety"),
            createRecommendationSlot("balanced"),
          ],
          selectedStrategy: "economy",
          baseCandidate: createCandidate("economy"),
          adjustments: {
            layerCount: 5,
            fluteType: "BC",
          },
          clientState: "recalculated",
        },
        {
          env: validEnv,
          cookieStore: createAuthenticatedCookieStore(),
          historyRepository,
          paperMaterialRepository: new InMemoryPaperMaterialRepository(),
          evaluateCandidateFn: ({ candidate }) => createEvaluation(candidate),
          now: new Date("2026-07-02T00:00:00.000Z"),
        },
      );

      expect(result).toEqual({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "当前方案未达标或不可生产，无法确认保存",
        },
      });
      expect(historyRepository.records).toHaveLength(0);
    },
  );

  it("rejects incomplete original recommendations and does not write history", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [createRecommendationSlot("economy"), createRecommendationSlot("safety")],
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        clientState: "recalculated",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        historyRepository,
        evaluateCandidateFn: () =>
          createEligibleEvaluation({ candidate: createCandidate("economy"), costYuan: 2.13, bctN: 520 }),
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "原始推荐结果不完整，请重新生成方案",
      },
    });
    expect(historyRepository.records).toHaveLength(0);
  });

  it("requires authentication before saving history", async () => {
    const historyRepository = new InMemoryMatchingSchemeHistoryRepository();
    const evaluateCandidateFn = vi.fn(() =>
      createEligibleEvaluation({ candidate: createCandidate("economy"), costYuan: 2.13, bctN: 520 }),
    );

    const result = await saveConfirmedMatchingScheme(
      {
        boxSpec: createValidInput(),
        originalRecommendationSlots: [
          createRecommendationSlot("economy"),
          createRecommendationSlot("safety"),
          createRecommendationSlot("balanced"),
        ],
        selectedStrategy: "economy",
        baseCandidate: createCandidate("economy"),
        clientState: "recalculated",
      },
      {
        env: validEnv,
        cookieStore: { get: () => undefined },
        historyRepository,
        evaluateCandidateFn,
        now: new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(evaluateCandidateFn).not.toHaveBeenCalled();
    expect(historyRepository.records).toHaveLength(0);
  });
});
