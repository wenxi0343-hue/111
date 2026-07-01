import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { BoxSpecInput } from "@/modules/box-spec/types";
import type { ListRecommendablePaperMaterialsRepository } from "@/modules/master-data/list-recommendable-paper-materials";
import type {
  BoardAreaResult,
  CostResult,
  DeviceLimitResult,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import {
  MATCHING_BASE_DATA_ERROR_MESSAGE,
  checkMatchingReadinessFromRepository,
  type MatchingReadiness,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import { generateMatchingScheme } from "@/server/actions/matching-actions";

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

  async listRecommendablePaperMaterials() {
    this.callCount += 1;

    return [];
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

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: { get: () => undefined },
      readinessRepository,
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

  it("returns recommendations only from eligible candidates and keeps rejected summaries", async () => {
    const eligibleCandidate = createCandidate("eligible");
    const deviceRejectedCandidate = createCandidate("device-rejected");
    const strengthRejectedCandidate = createCandidate("strength-rejected");
    const evaluateMatchingCandidatesFn = vi.fn().mockReturnValue({
      eligibleCandidates: [
        {
          status: "eligible",
          candidate: eligibleCandidate,
          area: createArea(),
          device: createDevice(),
          strength: createStrength(),
          cost: createCost(),
        },
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
        {
          status: "rejected",
          candidate: strengthRejectedCandidate,
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
        },
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
      createCandidates: () => [eligibleCandidate, deviceRejectedCandidate, strengthRejectedCandidate],
      evaluateMatchingCandidatesFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("matching action should succeed");
    }

    expect(result.data.recommendations.map((evaluation) => evaluation.candidate.id)).toEqual([
      "eligible",
    ]);
    expect(result.data.rejectedCandidates).toHaveLength(2);
    expect(result.data.rejectedSummary).toEqual([
      { type: "NOT_MANUFACTURABLE", label: "设备不可生产", count: 1 },
      { type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 },
    ]);
    expect(evaluateMatchingCandidatesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: [eligibleCandidate, deviceRejectedCandidate, strengthRejectedCandidate],
      }),
    );
  });

  it("does not read papers or evaluate candidates when readiness checks fail", async () => {
    const paperMaterialRepository = new InMemoryPaperMaterialRepository();
    const evaluateMatchingCandidatesFn = vi.fn();

    const result = await generateMatchingScheme(createValidInput(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository: new InMemoryMatchingReadinessRepository(
        createReadiness({ hasFormulaParameters: false }),
      ),
      paperMaterialRepository,
      evaluateMatchingCandidatesFn,
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(result.ok).toBe(false);
    expect(paperMaterialRepository.callCount).toBe(0);
    expect(evaluateMatchingCandidatesFn).not.toHaveBeenCalled();
  });

  it("returns field errors and skips readiness checks when required input is missing", async () => {
    const readinessRepository = new InMemoryMatchingReadinessRepository(createReadiness());
    const paperMaterialRepository = new InMemoryPaperMaterialRepository();
    const evaluateMatchingCandidatesFn = vi.fn();

    const result = await generateMatchingScheme(createValidInput({ lengthMm: "" }), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      readinessRepository,
      paperMaterialRepository,
      evaluateMatchingCandidatesFn,
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
});
