// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MatchingPage from "@/app/(main)/matching/page";
import { STACKING_NOT_REQUIRED_DISPLAY_TEXT } from "@/modules/box-spec/constants";
import type {
  BoardAreaResult,
  CandidateEvaluation,
  CostResult,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import {
  generateMatchingScheme,
  recalculateAdjustedScheme,
  saveConfirmedMatchingScheme,
  type GenerateMatchingSchemeResult,
} from "@/server/actions/matching-actions";

const actionMocks = vi.hoisted(() => ({
  generateMatchingScheme: vi.fn(),
  recalculateAdjustedScheme: vi.fn(),
  saveConfirmedMatchingScheme: vi.fn(),
}));

vi.mock("@/server/actions/matching-actions", () => ({
  generateMatchingScheme: actionMocks.generateMatchingScheme,
  recalculateAdjustedScheme: actionMocks.recalculateAdjustedScheme,
  saveConfirmedMatchingScheme: actionMocks.saveConfirmedMatchingScheme,
}));

const mockedGenerateMatchingScheme = vi.mocked(generateMatchingScheme);
const mockedRecalculateAdjustedScheme = vi.mocked(recalculateAdjustedScheme);
const mockedSaveConfirmedMatchingScheme = vi.mocked(saveConfirmedMatchingScheme);

function fillValidBoxSpecForm() {
  fireEvent.change(screen.getByLabelText("纸箱长度（mm）"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("纸箱宽度（mm）"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("纸箱高度（mm）"), { target: { value: "250" } });
  fireEvent.change(screen.getByLabelText("产品类型"), { target: { value: "食品" } });
  fireEvent.change(screen.getByLabelText("内装物重量（kg）"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("生产数量（个）"), { target: { value: "1000" } });
}

function createSuccessResult(): { ok: true; data: GenerateMatchingSchemeResult } {
  return {
    ok: true,
    data: {
      boxSpec: {
        lengthMm: 500,
        widthMm: 300,
        heightMm: 250,
        structureType: "0201",
        formingMethod: "glue",
        productType: "食品",
        productWeightKg: 10,
        arrangement: "single_row",
        productionQuantity: 1000,
        stackingRequirement: {
          status: "not_required",
          displayText: STACKING_NOT_REQUIRED_DISPLAY_TEXT,
        },
      },
      stackingIncluded: false,
      stackingDisplayText: STACKING_NOT_REQUIRED_DISPLAY_TEXT,
      recommendationSlots: [
        createUnavailableSlot("economy", "经济型"),
        createUnavailableSlot("safety", "安全型"),
        createUnavailableSlot("balanced", "均衡型"),
      ],
      recommendationMessages: [],
      rejectedSummary: [],
      rejectedCandidates: [],
      historicalHabitStatus: "unavailable",
    },
  };
}

function createSuccessResultWithStacking(): { ok: true; data: GenerateMatchingSchemeResult } {
  return {
    ok: true,
    data: {
      boxSpec: {
        lengthMm: 500,
        widthMm: 300,
        heightMm: 250,
        structureType: "0201",
        formingMethod: "glue",
        productType: "食品",
        productWeightKg: 10,
        arrangement: "single_row",
        productionQuantity: 1000,
        stackingRequirement: {
          status: "required",
          stackingLayers: 5,
          displayText: "已纳入堆码承重校核",
        },
      },
      stackingIncluded: true,
      recommendationSlots: [
        createUnavailableSlot("economy", "经济型"),
        createUnavailableSlot("safety", "安全型"),
        createUnavailableSlot("balanced", "均衡型"),
      ],
      recommendationMessages: [],
      rejectedSummary: [],
      rejectedCandidates: [],
      stackingDisplayText: "已纳入堆码承重校核",
      historicalHabitStatus: "unavailable",
    },
  };
}

function createMatchingResultWithDetails(): { ok: true; data: GenerateMatchingSchemeResult } {
  const economyCandidate = createCandidate("economy");
  const safetyCandidate = createCandidate("safety");
  const balancedCandidate = createCandidate("balanced");
  const deviceRejectedCandidate = createCandidate("device-rejected");
  const strengthRejectedCandidate = createCandidate("strength-rejected");
  const economyEvaluation = createEligibleEvaluation(economyCandidate);
  const safetyEvaluation = createEligibleEvaluation(safetyCandidate);
  const balancedEvaluation = createEligibleEvaluation(balancedCandidate);

  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendationSlots: [
        {
          strategy: "economy",
          title: "经济型",
          status: "recommended",
          isOfficialRecommendation: true,
          evaluation: economyEvaluation,
          messages: [],
          unavailableReasons: [],
        },
        {
          strategy: "safety",
          title: "安全型",
          status: "recommended",
          isOfficialRecommendation: true,
          evaluation: safetyEvaluation,
          messages: [],
          unavailableReasons: [],
        },
        {
          strategy: "balanced",
          title: "均衡型",
          status: "recommended",
          isOfficialRecommendation: true,
          evaluation: balancedEvaluation,
          messages: [],
          unavailableReasons: [],
        },
      ],
      recommendationMessages: [],
      rejectedSummary: [
        { type: "NOT_MANUFACTURABLE", label: "设备不可生产", count: 2 },
        { type: "DATA_MISSING", label: "数据不足", count: 1 },
        { type: "PARAMETER_ERROR", label: "参数异常", count: 1 },
        { type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 },
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
            {
              type: "NOT_MANUFACTURABLE",
              code: "BOX_HEIGHT_TOO_LARGE",
              message: "箱高超过设备限制",
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
              {
                type: "NOT_MANUFACTURABLE",
                code: "BOX_HEIGHT_TOO_LARGE",
                message: "箱高超过设备限制",
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
          device: {
            isManufacturable: true,
            reasons: [],
          },
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
    },
  };
}

function createEmptyRecommendationResult(): { ok: true; data: GenerateMatchingSchemeResult } {
  const weakEvaluation = {
    status: "rejected",
    candidate: createCandidate("weak"),
    reasons: [{ type: "STRENGTH_UNQUALIFIED", code: "ECT_TOO_LOW", message: "边压不足" }],
    area: createArea(),
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: {
      ...createStrength(),
      isQualified: false,
      reasons: [{ type: "STRENGTH_UNQUALIFIED", code: "ECT_TOO_LOW", message: "边压不足" }],
    },
    cost: createCost(),
  } satisfies CandidateEvaluation;

  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendationSlots: [
        {
          strategy: "economy",
          title: "经济型",
          status: "reference",
          isOfficialRecommendation: false,
          evaluation: weakEvaluation,
          messages: [],
          unavailableReasons: weakEvaluation.reasons,
        },
        createUnavailableSlot("safety", "安全型", "所有安全型候选抗压富余率超过 200% 上限"),
        createUnavailableSlot("balanced", "均衡型", "没有可展示的参考方案"),
      ],
      recommendationMessages: ["当前没有达标可生产方案，以下仅供调整参考"],
      rejectedSummary: [{ type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 }],
      rejectedCandidates: [
        weakEvaluation,
      ],
    },
  };
}

function createRepeatedRecommendationResult(): { ok: true; data: GenerateMatchingSchemeResult } {
  const evaluation = createEligibleEvaluation(createCandidate("repeated"));

  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendationSlots: [
        {
          strategy: "economy",
          title: "经济型",
          status: "recommended",
          isOfficialRecommendation: true,
          evaluation,
          messages: [],
          unavailableReasons: [],
        },
        {
          strategy: "safety",
          title: "安全型",
          status: "repeated",
          isOfficialRecommendation: true,
          evaluation,
          messages: ["该组合同时也是某策略下最优"],
          repeatedFrom: "economy",
          unavailableReasons: [],
        },
        createUnavailableSlot("balanced", "均衡型", "没有更多不同的达标可生产候选组合"),
      ],
    },
  };
}

function createHistoricalHabitRecommendationResult(): {
  ok: true;
  data: GenerateMatchingSchemeResult;
} {
  const result = createMatchingResultWithDetails();

  return {
    ok: true,
    data: {
      ...result.data,
      historicalHabitStatus: "available",
      recommendationMessages: ["历史常用组合当前不可用，已改为相近达标方案"],
      recommendationSlots: [
        {
          ...result.data.recommendationSlots[0],
          historicalHabit: {
            level: "high",
            label: "高匹配",
            reasons: [
              "相似产品中五层 BC 楞出现 18 次，占比 62%",
              "纸厂和克重组合与历史常用组合一致",
            ],
            evidences: [
              {
                dimensionType: "product",
                dimensionKey: "脱敏电子产品",
                matchedFields: ["layer_count", "flute", "factory", "gram_weight"],
                layerCount: 5,
                flute: "BC",
                orderCount: 18,
                frequency: 0.62,
              },
            ],
            conflictMessages: ["历史常用组合本次边压不足，已改为推荐达标的相近方案"],
          },
        },
        {
          ...result.data.recommendationSlots[1],
          historicalHabit: {
            level: "medium",
            label: "中匹配",
            reasons: ["相似尺寸区间中三层 B 楞仍有历史参考"],
            evidences: [
              {
                dimensionType: "size_bucket",
                dimensionKey: "小箱",
                matchedFields: ["layer_count", "flute"],
                layerCount: 3,
                flute: "B",
                orderCount: 8,
                frequency: 0.4,
              },
            ],
            conflictMessages: [],
          },
        },
        {
          ...result.data.recommendationSlots[2],
          historicalHabit: {
            level: "low",
            label: "低匹配",
            reasons: ["当前方案与历史常用组合只匹配部分弱特征"],
            evidences: [
              {
                dimensionType: "weight_bucket",
                dimensionKey: "≤20kg",
                matchedFields: ["layer_count"],
                layerCount: 3,
                orderCount: 5,
                frequency: 0.25,
              },
            ],
            conflictMessages: [],
          },
        },
      ],
    },
  };
}

function createInsufficientHistoricalHabitRecommendationResult(): {
  ok: true;
  data: GenerateMatchingSchemeResult;
} {
  const result = createMatchingResultWithDetails();
  const createSlotWithInsufficientHistory = (slot: RecommendationSlot): RecommendationSlot => ({
    ...slot,
    historicalHabit: {
      level: "insufficient",
      label: "暂无足够历史参考",
      reasons: ["相似历史订单少于 5 条，本次按现有推荐逻辑生成方案"],
      evidences: [],
      conflictMessages: [],
    },
  });

  return {
    ok: true,
    data: {
      ...result.data,
      historicalHabitStatus: "insufficient",
      recommendationMessages: ["暂无足够历史参考，本次按现有推荐逻辑生成方案"],
      recommendationSlots: [
        createSlotWithInsufficientHistory(result.data.recommendationSlots[0]),
        createSlotWithInsufficientHistory(result.data.recommendationSlots[1]),
        createSlotWithInsufficientHistory(result.data.recommendationSlots[2]),
      ],
    },
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

function createEligibleEvaluation(candidate: MatchingCandidate): CandidateEvaluation {
  return {
    status: "eligible",
    candidate,
    area: createArea(),
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: createStrength(),
    cost: createCost(),
  };
}

function createRecalculatedEvaluation(overrides: {
  candidate?: MatchingCandidate | undefined;
  bctN?: number | undefined;
  costYuan?: number | undefined;
} = {}): CandidateEvaluation {
  return {
    status: "eligible",
    candidate: overrides.candidate ?? {
      ...createCandidate("adjusted"),
      layerCount: 5,
      fluteType: "BC",
    },
    area: createArea(),
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: {
      ...createStrength(),
      bctN: overrides.bctN ?? 900,
    },
    cost: {
      ...createCost(),
      taxIncludedCostYuan: overrides.costYuan ?? 2.45,
    },
  };
}

function createNotManufacturableEvaluation(): CandidateEvaluation {
  return {
    status: "rejected",
    candidate: {
      ...createCandidate("adjusted"),
      layerCount: 5,
      fluteType: "BC",
    },
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

function createUnqualifiedEvaluation(): CandidateEvaluation {
  return {
    status: "rejected",
    candidate: {
      ...createCandidate("adjusted"),
      layerCount: 5,
      fluteType: "BC",
    },
    reasons: [
      {
        type: "STRENGTH_UNQUALIFIED",
        code: "BCT_TOO_LOW",
        message: "空箱抗压不足",
      },
    ],
    area: createArea(),
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: {
      ...createStrength(),
      isQualified: false,
      reasons: [
        {
          type: "STRENGTH_UNQUALIFIED",
          code: "BCT_TOO_LOW",
          message: "空箱抗压不足",
        },
      ],
    },
    cost: createCost(),
  };
}

function createUnavailableSlot(
  strategy: RecommendationSlot["strategy"],
  title: RecommendationSlot["title"],
  message = "没有可展示的参考方案",
): RecommendationSlot {
  return {
    strategy,
    title,
    status: "unavailable",
    isOfficialRecommendation: false,
    messages: [],
    unavailableReasons: [
      {
        type: "PARAMETER_ERROR",
        code: "NO_DISPLAYABLE_REFERENCE",
        message,
      },
    ],
  };
}

describe("matching page", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: class ResizeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    });
    mockedGenerateMatchingScheme.mockResolvedValue(createSuccessResult());
    mockedRecalculateAdjustedScheme.mockResolvedValue({
      ok: true,
      data: {
        finalEvaluation: createRecalculatedEvaluation(),
        finalStatus: "qualified",
        isManuallyAdjusted: true,
        warningMessages: [],
        canSave: true,
      },
    });
    mockedSaveConfirmedMatchingScheme.mockResolvedValue({
      ok: true,
      data: {
        schemeId: "scheme-1",
        finalStatus: "qualified",
        isManuallyAdjusted: false,
        warningMessages: [],
        savedAt: "2026-07-02T00:00:00.000Z",
      },
    });
  });

  it("renders box spec fields without stacking total height", () => {
    render(<MatchingPage />);

    expect(screen.getByRole("heading", { name: "单次配纸" })).toBeTruthy();
    expect(screen.getByLabelText("纸箱长度（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱宽度（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱高度（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱结构类型")).toBeTruthy();
    expect(screen.getByLabelText("成箱方式")).toBeTruthy();
    expect(screen.getByLabelText("产品类型")).toBeTruthy();
    expect(screen.getByLabelText("内装物重量（kg）")).toBeTruthy();
    expect(screen.getByLabelText("内装物排列方式")).toBeTruthy();
    expect(screen.getByLabelText("生产数量（个）")).toBeTruthy();
    expect(screen.getByLabelText("堆码层数（层）")).toBeTruthy();
    expect(screen.queryByText("堆码总高度")).toBeNull();
    expect(document.querySelector('[name="stackingHeight"]')).toBeNull();
    expect(document.querySelector('[name="stackingTotalHeight"]')).toBeNull();
  });

  it("submits without stacking layers when other required fields are filled", async () => {
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    await waitFor(() => {
      expect(mockedGenerateMatchingScheme).toHaveBeenCalledWith({
        lengthMm: "500",
        widthMm: "300",
        heightMm: "250",
        structureType: "0201",
        formingMethod: "glue",
        productType: "食品",
        productWeightKg: "10",
        arrangement: "single_row",
        specialRequirements: undefined,
        productionQuantity: "1000",
        stackingLayers: undefined,
      });
    });
  });

  it("shows field errors beside the matching input fields", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请检查纸箱输入",
        details: {
          fieldErrors: [
            { field: "lengthMm", message: "纸箱长度不能为空" },
            { field: "widthMm", message: "纸箱宽度允许范围为 100-1500mm" },
            { field: "stackingLayers", message: "堆码层数允许范围为 1-30 层" },
          ],
        },
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("纸箱长度不能为空")).toBeTruthy();
    expect(screen.getByText("纸箱宽度允许范围为 100-1500mm")).toBeTruthy();
    expect(screen.getByText("堆码层数允许范围为 1-30 层")).toBeTruthy();
  });

  it("shows base data errors without mapping them to a missing input", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先维护纸厂、箱板纸、瓦纸和基础参数",
        details: {
          fieldErrors: [
            {
              field: "baseData",
              message: "请先维护纸厂、箱板纸、瓦纸和基础参数",
            },
          ],
        },
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("请先维护纸厂、箱板纸、瓦纸和基础参数")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("stack");
    expect(document.body.textContent ?? "").not.toContain("postgresql://");
  });

  it("does not show recommendation slots when authentication is required", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("需要先登录")).toBeTruthy();
    expect(screen.queryByTestId("recommendation-slot-economy")).toBeNull();
    expect(screen.queryByTestId("recommendation-slot-safety")).toBeNull();
    expect(screen.queryByTestId("recommendation-slot-balanced")).toBeNull();
  });

  it("shows stacking not checked text after a successful submit without stacking layers", async () => {
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText(STACKING_NOT_REQUIRED_DISPLAY_TEXT)).toBeTruthy();
  });

  it("does not show stacking pass or fail conclusions when stacking layers are empty", async () => {
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText(STACKING_NOT_REQUIRED_DISPLAY_TEXT)).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("承重达标");
    expect(document.body.textContent ?? "").not.toContain("承重不达标");
    expect(document.body.textContent ?? "").not.toContain("堆码达标");
    expect(document.body.textContent ?? "").not.toContain("堆码不达标");
  });

  it("shows stacking layers are included after a successful submit with stacking layers", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createSuccessResultWithStacking());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.change(screen.getByLabelText("堆码层数（层）"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("已纳入堆码承重校核（5 层）")).toBeTruthy();
  });

  it("shows recommended candidate summaries returned by the server", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("推荐方案")).toBeTruthy();
    expect(screen.getByText("经济型")).toBeTruthy();
    expect(screen.getByText("安全型")).toBeTruthy();
    expect(screen.getByText("均衡型")).toBeTruthy();
    expect(screen.getAllByText("正式推荐")).toHaveLength(3);
    expect(screen.getAllByText("3 层 B 楞").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("面积 0.8905 m²").length).toBeGreaterThan(0);
    expect(screen.getAllByText("空箱抗压 450 N").length).toBeGreaterThan(0);
    expect(screen.getAllByText("边压 4.50 kN/m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("耐破 3800").length).toBeGreaterThan(0);
    expect(screen.getAllByText("含税成本 2.13 元").length).toBeGreaterThan(0);
  });

  it("shows historical habit labels, reasons, and conflict messages on recommendation cards", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createHistoricalHabitRecommendationResult());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    const economySlot = await screen.findByTestId("recommendation-slot-economy");

    expect(economySlot.textContent ?? "").toContain("历史参考");
    expect(economySlot.textContent ?? "").toContain("高匹配");
    expect(economySlot.textContent ?? "").toContain("相似产品中五层 BC 楞出现 18 次，占比 62%");
    expect(economySlot.textContent ?? "").toContain("纸厂和克重组合与历史常用组合一致");
    expect(economySlot.textContent ?? "").toContain("历史常用组合本次边压不足，已改为推荐达标的相近方案");
    expect(screen.getByText("中匹配")).toBeTruthy();
    expect(screen.getByText("低匹配")).toBeTruthy();
    expect(screen.getByText("历史常用组合当前不可用，已改为相近达标方案")).toBeTruthy();
  });

  it("shows insufficient history without exposing score, historical cost, or customer preference scope", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(
      createInsufficientHistoricalHabitRecommendationResult(),
    );
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    const economySlot = await screen.findByTestId("recommendation-slot-economy");
    const pageText = document.body.textContent ?? "";

    expect(economySlot.textContent ?? "").toContain("暂无足够历史参考");
    expect(economySlot.textContent ?? "").toContain("相似历史订单少于 5 条，本次按现有推荐逻辑生成方案");
    expect(economySlot.textContent ?? "").not.toContain("高匹配");
    expect(economySlot.textContent ?? "").not.toContain("中匹配");
    expect(economySlot.textContent ?? "").not.toContain("低匹配");
    expect(pageText).not.toContain("historicalHabitScore");
    expect(pageText).not.toContain("rawScore");
    expect(pageText).not.toContain("score");
    expect(pageText).not.toContain("历史价格");
    expect(pageText).not.toContain("历史成本");
    expect(pageText).not.toContain("客户偏好");
    expect(pageText).not.toContain("成本趋势");
    expect(pageText).not.toContain("批量配纸");
  });

  it("marks a clicked recommendation as the current final scheme", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));

    expect(screen.getByText("当前最终方案：经济型")).toBeTruthy();
  });

  it("saves the selected unadjusted recommendation only after confirmation", async () => {
    const matchingResult = createMatchingResultWithDetails();
    mockedGenerateMatchingScheme.mockResolvedValue(matchingResult);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    await screen.findByText("推荐方案");
    expect(mockedSaveConfirmedMatchingScheme).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "选择经济型" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    await waitFor(() => {
      expect(mockedSaveConfirmedMatchingScheme).toHaveBeenCalledWith({
        boxSpec: {
          lengthMm: 500,
          widthMm: 300,
          heightMm: 250,
          structureType: "0201",
          formingMethod: "glue",
          productType: "食品",
          productWeightKg: 10,
          arrangement: "single_row",
          productionQuantity: 1000,
        },
        originalRecommendationSlots: matchingResult.data.recommendationSlots,
        selectedStrategy: "economy",
        baseCandidate: matchingResult.data.recommendationSlots[0].evaluation?.candidate,
        clientState: "recalculated",
      });
    });
    expect(await screen.findByText("保存成功")).toBeTruthy();
  });

  it("shows PDF export links after a scheme is saved", async () => {
    const matchingResult = createMatchingResultWithDetails();
    mockedGenerateMatchingScheme.mockResolvedValue(matchingResult);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));

    expect(screen.queryByRole("link", { name: "完整报告 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "精简方案表 PDF" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    const fullReportLink = await screen.findByRole("link", { name: "完整报告 PDF" });
    const summarySheetLink = screen.getByRole("link", { name: "精简方案表 PDF" });

    expect(fullReportLink.getAttribute("href")).toBe(
      "/api/exports/matching-schemes/scheme-1?type=full_report",
    );
    expect(summarySheetLink.getAttribute("href")).toBe(
      "/api/exports/matching-schemes/scheme-1?type=summary_sheet",
    );
  });

  it("marks the final scheme as pending recalculation after changing flute type", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));

    expect(screen.getByText("待重新校核")).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认保存" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "重新校核" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("link", { name: "完整报告 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "精简方案表 PDF" })).toBeNull();
  });

  it("shows recalculated metrics after clicking recalculation", async () => {
    const matchingResult = createMatchingResultWithDetails();
    mockedGenerateMatchingScheme.mockResolvedValue(matchingResult);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));

    const recalculatedPanel = await screen.findByTestId("recalculated-final-scheme");

    expect(recalculatedPanel.textContent ?? "").toContain("达标");
    expect(recalculatedPanel.textContent ?? "").toContain("空箱抗压 900 N");
    expect(recalculatedPanel.textContent ?? "").toContain("含税成本 2.45 元");
    await waitFor(() => {
      expect(mockedRecalculateAdjustedScheme).toHaveBeenCalledWith({
        boxSpec: {
          lengthMm: 500,
          widthMm: 300,
          heightMm: 250,
          structureType: "0201",
          formingMethod: "glue",
          productType: "食品",
          productWeightKg: 10,
          arrangement: "single_row",
          productionQuantity: 1000,
        },
        selectedStrategy: "economy",
        baseCandidate: matchingResult.data.recommendationSlots[0].evaluation?.candidate,
        adjustments: expect.objectContaining({
          fluteType: "BC",
        }),
      });
    });
  });

  it("shows not manufacturable recalculation without old qualified state", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    mockedRecalculateAdjustedScheme.mockResolvedValue({
      ok: true,
      data: {
        finalEvaluation: createNotManufacturableEvaluation(),
        finalStatus: "not_manufacturable",
        isManuallyAdjusted: true,
        warningMessages: ["最终方案不可生产，不建议生产"],
        canSave: true,
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));

    const recalculatedPanel = await screen.findByTestId("recalculated-final-scheme");

    expect(recalculatedPanel.textContent ?? "").toContain("不可生产");
    expect(recalculatedPanel.textContent ?? "").toContain("不建议生产");
    expect(recalculatedPanel.textContent ?? "").toContain("纸板宽超过设备限制");
    expect(recalculatedPanel.textContent ?? "").not.toContain("达标");
    expect(recalculatedPanel.textContent ?? "").not.toContain("空箱抗压 450 N");
  });

  it("saves a recalculated adjusted scheme and shows manual adjustment summary", async () => {
    const matchingResult = createMatchingResultWithDetails();
    mockedGenerateMatchingScheme.mockResolvedValue(matchingResult);
    mockedSaveConfirmedMatchingScheme.mockResolvedValue({
      ok: true,
      data: {
        schemeId: "scheme-adjusted-1",
        finalStatus: "qualified",
        isManuallyAdjusted: true,
        warningMessages: [],
        savedAt: "2026-07-02T08:30:00.000Z",
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));
    await screen.findByTestId("recalculated-final-scheme");
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    await waitFor(() => {
      expect(mockedSaveConfirmedMatchingScheme).toHaveBeenCalledWith({
        boxSpec: {
          lengthMm: 500,
          widthMm: 300,
          heightMm: 250,
          structureType: "0201",
          formingMethod: "glue",
          productType: "食品",
          productWeightKg: 10,
          arrangement: "single_row",
          productionQuantity: 1000,
        },
        originalRecommendationSlots: matchingResult.data.recommendationSlots,
        selectedStrategy: "economy",
        baseCandidate: matchingResult.data.recommendationSlots[0].evaluation?.candidate,
        adjustments: expect.objectContaining({
          fluteType: "BC",
        }),
        clientState: "recalculated",
      });
    });

    const savedPanel = await screen.findByTestId("saved-scheme-summary");

    expect(savedPanel.textContent ?? "").toContain("保存成功");
    expect(savedPanel.textContent ?? "").toContain("用户已手动调整");
    expect(savedPanel.textContent ?? "").toContain("达标");
    expect(savedPanel.textContent ?? "").toContain("2026-07-02T08:30:00.000Z");
    expect(screen.getByText("推荐方案")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("确认保存").closest("button")).toHaveProperty("disabled", true);
    });
  });

  it("keeps recalculated result visible when adjusted save fails", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    mockedSaveConfirmedMatchingScheme.mockResolvedValue({
      ok: false,
      error: {
        code: "SAVE_FAILED",
        message: "方案保存失败，请稍后重试",
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));
    const recalculatedPanel = await screen.findByTestId("recalculated-final-scheme");
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    expect(await screen.findByText("方案保存失败，请稍后重试")).toBeTruthy();
    expect(recalculatedPanel.textContent ?? "").toContain("空箱抗压 900 N");
    expect(screen.queryByTestId("saved-scheme-summary")).toBeNull();
    expect(screen.queryByRole("link", { name: "完整报告 PDF" })).toBeNull();
    expect(screen.queryByRole("link", { name: "精简方案表 PDF" })).toBeNull();
  });

  it("disables confirm save for not manufacturable recalculated schemes", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    mockedRecalculateAdjustedScheme.mockResolvedValue({
      ok: true,
      data: {
        finalEvaluation: createNotManufacturableEvaluation(),
        finalStatus: "not_manufacturable",
        isManuallyAdjusted: true,
        warningMessages: ["最终方案不可生产，不建议生产"],
        canSave: false,
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));
    const recalculatedPanel = await screen.findByTestId("recalculated-final-scheme");
    const saveButton = screen.getByRole("button", { name: "确认保存" });

    expect(recalculatedPanel.textContent ?? "").toContain("不可生产");
    expect(recalculatedPanel.textContent ?? "").toContain("不建议生产");
    expect(saveButton).toHaveProperty("disabled", true);
    expect(mockedSaveConfirmedMatchingScheme).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-scheme-summary")).toBeNull();
  });

  it("disables confirm save for unqualified recalculated schemes", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    mockedRecalculateAdjustedScheme.mockResolvedValue({
      ok: true,
      data: {
        finalEvaluation: createUnqualifiedEvaluation(),
        finalStatus: "unqualified",
        isManuallyAdjusted: true,
        warningMessages: ["最终方案未达标，不建议生产"],
        canSave: false,
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.mouseDown(screen.getByLabelText("调整瓦型"));
    fireEvent.click(await screen.findByText("BC 楞"));
    fireEvent.click(screen.getByRole("button", { name: "重新校核" }));
    const recalculatedPanel = await screen.findByTestId("recalculated-final-scheme");
    const saveButton = screen.getByRole("button", { name: "确认保存" });

    expect(recalculatedPanel.textContent ?? "").toContain("未达标");
    expect(recalculatedPanel.textContent ?? "").toContain("不建议生产");
    expect(saveButton).toHaveProperty("disabled", true);
    expect(mockedSaveConfirmedMatchingScheme).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-scheme-summary")).toBeNull();
  });

  it("keeps calculated recommendation values read-only on the page", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect((await screen.findAllByText("含税成本 2.13 元")).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("含税成本")).toBeNull();
    expect(screen.queryByLabelText("耐破")).toBeNull();
    expect(screen.queryByLabelText("边压")).toBeNull();
    expect(screen.queryByLabelText("空箱抗压")).toBeNull();
    expect(screen.queryByLabelText("是否达标")).toBeNull();
    expect(screen.queryByLabelText("是否可生产")).toBeNull();
  });

  it("shows save validation errors without leaking technical details", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    mockedSaveConfirmedMatchingScheme.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "原始推荐结果不完整，请重新生成方案",
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));
    fireEvent.click(screen.getByRole("button", { name: "确认保存" }));

    expect(await screen.findByText("原始推荐结果不完整，请重新生成方案")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("stack");
    expect(document.body.textContent ?? "").not.toContain("postgresql://");
  });

  it("shows repeated recommendation messages and unavailable reasons", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createRepeatedRecommendationResult());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("重复推荐")).toBeTruthy();
    expect(screen.getByText("该组合同时也是某策略下最优")).toBeTruthy();
    expect(screen.getByText("不可用")).toBeTruthy();
    expect(screen.getByText("没有更多不同的达标可生产候选组合")).toBeTruthy();
  });

  it("shows reference messages and reasons when no candidate is eligible", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createEmptyRecommendationResult());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("当前没有达标可生产方案，以下仅供调整参考")).toBeTruthy();
    expect(screen.getByText("参考方案")).toBeTruthy();
    expect(screen.getAllByText("边压不足").length).toBeGreaterThan(0);
    expect(screen.getByText("所有安全型候选抗压富余率超过 200% 上限")).toBeTruthy();
    expect(screen.getByText("没有可展示的参考方案")).toBeTruthy();
  });

  it("shows rejected summary counts for all reason types", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("设备不可生产 2")).toBeTruthy();
    expect(screen.getByText("数据不足 1")).toBeTruthy();
    expect(screen.getByText("参数异常 1")).toBeTruthy();
    expect(screen.getByText("强度不达标 1")).toBeTruthy();
  });

  it("shows expandable rejected candidate details with every reason", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("不可推荐候选明细")).toBeTruthy();
    expect(
      screen.getByText(
        "3 层 B 楞 - device-rejected-P1 / device-rejected-W1 / device-rejected-P2",
      ),
    ).toBeTruthy();
    expect(screen.getByText("纸板宽超过设备限制")).toBeTruthy();
    expect(screen.getByText("箱高超过设备限制")).toBeTruthy();
    expect(
      screen.getByText(
        "3 层 B 楞 - strength-rejected-P1 / strength-rejected-W1 / strength-rejected-P2",
      ),
    ).toBeTruthy();
    expect(screen.getByText("边压不足")).toBeTruthy();
  });

  it("does not show strength or cost fields for non-manufacturable candidates", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    const deviceSection = await screen.findByTestId("rejected-candidate-device-rejected");

    expect(deviceSection.textContent ?? "").toContain("纸板宽超过设备限制");
    expect(deviceSection.textContent ?? "").not.toContain("空箱抗压");
    expect(deviceSection.textContent ?? "").not.toContain("含税成本");
  });

  it("shows area, strength, and cost for strength-unqualified candidates", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    const strengthSection = await screen.findByTestId("rejected-candidate-strength-rejected");

    expect(strengthSection.textContent ?? "").toContain("面积 0.8905 m²");
    expect(strengthSection.textContent ?? "").toContain("空箱抗压 450 N");
    expect(strengthSection.textContent ?? "").toContain("边压 4.50 kN/m");
    expect(strengthSection.textContent ?? "").toContain("耐破 3800");
    expect(strengthSection.textContent ?? "").toContain("含税成本 2.13 元");
  });

  it("keeps matching page free of core calculation and recommendation formulas", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "app",
        "(main)",
        "matching",
        "_components",
        "box-spec-form.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain("matchingResult.recommendations");
    expect(source).not.toContain("selectMatchingRecommendations");
    expect(source).not.toContain("evaluateMatchingCandidates");
    expect(source).not.toContain("calculateBoardArea");
    expect(source).not.toContain("calculateStrength");
    expect(source).not.toContain("calculateCost");
    expect(source).not.toContain("minBctN");
    expect(source).not.toContain("edgeCrushCorrectionFactor");
    expect(source).not.toContain("processingFeeFactorsByLayerCount");
    expect(source).not.toContain("utilizationRateRules");
  });
});
