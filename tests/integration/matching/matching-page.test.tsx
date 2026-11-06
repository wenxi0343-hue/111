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
import type { SelectionReason } from "@/modules/ai-reasoning/types";
import {
  generateMatchingScheme,
  saveConfirmedMatchingScheme,
  type GenerateMatchingSchemeResult,
} from "@/server/actions/matching-actions";

const actionMocks = vi.hoisted(() => ({
  generateMatchingScheme: vi.fn(),
  saveConfirmedMatchingScheme: vi.fn(),
}));

vi.mock("@/server/actions/matching-actions", () => ({
  generateMatchingScheme: actionMocks.generateMatchingScheme,
  saveConfirmedMatchingScheme: actionMocks.saveConfirmedMatchingScheme,
}));

const mockedGenerateMatchingScheme = vi.mocked(generateMatchingScheme);
const mockedSaveConfirmedMatchingScheme = vi.mocked(saveConfirmedMatchingScheme);

function fillValidBoxSpecForm() {
  fireEvent.change(screen.getByLabelText("纸箱内长（mm）"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("纸箱内宽（mm）"), { target: { value: "300" } });
  fireEvent.change(screen.getByLabelText("纸箱内高（mm）"), { target: { value: "250" } });
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
        specialRequirements: {
          dieCutting: false,
          punctureStrengthRequired: false,
        },
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
      generationToken: "test-generation-token",
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
      rejectedCandidates: [weakEvaluation],
    },
  };
}

function createUnavailableRecommendationResultWithRejectedArea(): {
  ok: true;
  data: GenerateMatchingSchemeResult;
} {
  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendationMessages: ["当前没有达标可生产方案，以下仅供调整参考"],
      rejectedSummary: [{ type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 }],
      rejectedCandidates: [
        {
          status: "rejected",
          candidate: createCandidate("weak"),
          reasons: [{ type: "STRENGTH_UNQUALIFIED", code: "ECT_TOO_LOW", message: "边压不足" }],
          area: createArea(),
        },
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
          factoryName: "重庆理文",
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
          factoryName: "云南东晟",
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
          factoryName: "重庆理文",
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
    innerLengthMm: 500,
    innerWidthMm: 300,
    innerHeightMm: 250,
    boardLengthMm: 1657,
    boardWidthMm: 564,
    feedLengthMm: 1657,
    feedWidthMm: 564,
    printLengthMm: 1657,
    printWidthMm: 564,
    slotIntervalsMm: {
      firstPanel: 500,
      firstSlot: 300,
      secondPanel: 500,
      secondSlot: 300,
    },
    areaSquareMeters: 0.9345,
    formingPieces: 1,
    flapMm: 154,
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

function createSelectionReason(
  sourceLabel: SelectionReason["sourceLabel"],
  text: string,
  fallbackReason?: SelectionReason["fallbackReason"],
): SelectionReason {
  return {
    source: sourceLabel === "AI 生成" ? "ai" : "template",
    sourceLabel,
    text,
    fallbackReason,
    generatedAt: "2026-07-04T00:00:00.000Z",
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
    expect(screen.getByLabelText("纸箱内长（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱内宽（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱内高（mm）")).toBeTruthy();
    expect(screen.getByLabelText("纸箱结构类型")).toBeTruthy();
    expect(screen.getByLabelText("成箱方式")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "产品类型" })).toBeTruthy();
    expect(screen.getByLabelText("内装物重量（kg）")).toBeTruthy();
    expect(screen.getByLabelText("内装物排列方式")).toBeTruthy();
    expect(screen.getByLabelText("生产数量（个）")).toBeTruthy();
    expect(screen.getByLabelText("堆码层数（层）")).toBeTruthy();
    expect(screen.getByLabelText("模切工艺")).toBeTruthy();
    expect(screen.getByLabelText("戳穿强度要求")).toBeTruthy();
    expect(screen.getByLabelText("其他特殊说明")).toBeTruthy();
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
        specialRequirements: {
          dieCutting: false,
          punctureStrengthRequired: false,
          notes: undefined,
        },
        productionQuantity: "1000",
        stackingLayers: undefined,
      });
    });
  });

  it("submits structured special requirements", async () => {
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByLabelText("模切工艺"));
    fireEvent.click(screen.getByLabelText("戳穿强度要求"));
    fireEvent.change(screen.getByLabelText("其他特殊说明"), { target: { value: " 防潮 " } });
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    await waitFor(() => {
      expect(mockedGenerateMatchingScheme).toHaveBeenCalledWith(
        expect.objectContaining({
          specialRequirements: {
            dieCutting: true,
            punctureStrengthRequired: true,
            notes: " 防潮 ",
          },
        }),
      );
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
            { field: "lengthMm", message: "纸箱内长不能为空" },
            { field: "widthMm", message: "纸箱内宽允许范围为 100-1500mm" },
            { field: "stackingLayers", message: "堆码层数允许范围为 1-30 层" },
          ],
        },
      },
    });
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("纸箱内长不能为空")).toBeTruthy();
    expect(screen.getByText("纸箱内宽允许范围为 100-1500mm")).toBeTruthy();
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

  it("shows calculated area after a successful submit without stacking layers", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("计算面积")).toBeTruthy();
    expect(screen.getByText("0.9345 m²")).toBeTruthy();
    expect(screen.queryByText("堆码承重")).toBeNull();
    expect(screen.queryByText(STACKING_NOT_REQUIRED_DISPLAY_TEXT)).toBeNull();
  });

  it("shows calculated area when no recommendation slot can be displayed", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(
      createUnavailableRecommendationResultWithRejectedArea(),
    );
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("计算面积")).toBeTruthy();
    expect(screen.getByText("0.9345 m²")).toBeTruthy();
    expect(screen.queryByText("暂无面积结果")).toBeNull();
  });

  it("does not show stacking pass or fail conclusions when stacking layers are empty", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("计算面积")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("承重达标");
    expect(document.body.textContent ?? "").not.toContain("承重不达标");
    expect(document.body.textContent ?? "").not.toContain("堆码达标");
    expect(document.body.textContent ?? "").not.toContain("堆码不达标");
  });

  it("keeps calculated area visible instead of stacking summary when stacking layers are included", async () => {
    const result = createMatchingResultWithDetails();
    result.data.boxSpec.stackingRequirement = {
      status: "required",
      stackingLayers: 5,
      displayText: "已纳入堆码承重校核",
    };
    result.data.stackingIncluded = true;
    result.data.stackingDisplayText = "已纳入堆码承重校核";
    mockedGenerateMatchingScheme.mockResolvedValue(result);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.change(screen.getByLabelText("堆码层数（层）"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("计算面积")).toBeTruthy();
    expect(screen.getByText("0.9345 m²")).toBeTruthy();
    expect(screen.queryByText("已纳入堆码承重校核（5 层）")).toBeNull();
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
    expect(screen.getAllByText("空箱抗压").length).toBeGreaterThan(0);
    expect(screen.getAllByText("450 N").length).toBeGreaterThan(0);
    expect(screen.getAllByText("边压").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4.50 kN/m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("耐破").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3800").length).toBeGreaterThan(0);
    expect(screen.getAllByText("含税成本").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.13 元").length).toBeGreaterThan(0);
    expect(screen.getAllByText("面纸：economy-P1 / 200g / 重庆理文").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B瓦：economy-W1 / 160g / 云南东晟").length).toBeGreaterThan(0);
    expect(screen.getAllByText("里纸：economy-P2 / 200g / 重庆理文").length).toBeGreaterThan(0);
  });

  it("keeps recommendation cards collapsed until the user expands one", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    const economyDetails = await screen.findByTestId("recommendation-details-economy");
    const safetyDetails = screen.getByTestId("recommendation-details-safety");
    const balancedDetails = screen.getByTestId("recommendation-details-balanced");

    expect(economyDetails).toHaveProperty("open", false);
    expect(safetyDetails).toHaveProperty("open", false);
    expect(balancedDetails).toHaveProperty("open", false);
    expect(screen.getByTestId("recommendation-slot-economy").textContent ?? "").toContain("经济型");
    expect(screen.getByTestId("recommendation-slot-economy").textContent ?? "").toContain(
      "3 层 B 楞",
    );
    expect(screen.getAllByText("含税成本").length).toBeGreaterThan(0);
    expect(screen.getAllByText("边压").length).toBeGreaterThan(0);
    expect(screen.getAllByText("空箱抗压").length).toBeGreaterThan(0);
    expect(screen.getAllByText("耐破").length).toBeGreaterThan(0);
    expect(screen.getByTestId("recommendation-slot-economy").textContent ?? "").toContain(
      "面纸：economy-P1 / 200g / 重庆理文",
    );

    fireEvent.click(economyDetails.querySelector("summary") as HTMLElement);

    expect(economyDetails).toHaveProperty("open", true);
    expect(economyDetails.textContent ?? "").toContain("选型理由");
    expect(economyDetails.textContent ?? "").not.toContain("强度要求");
    expect(economyDetails.textContent ?? "").not.toContain("生产要求");
    expect(economyDetails.textContent ?? "").not.toContain("原纸组合");
    expect(economyDetails.textContent ?? "").not.toContain("含税成本");
    expect(economyDetails.textContent ?? "").not.toContain("边压");
    expect(economyDetails.textContent ?? "").not.toContain("空箱抗压");
    expect(economyDetails.textContent ?? "").not.toContain("耐破");
  });

  it("completes the main matching flow from input to saved output", async () => {
    const matchingResult = createMatchingResultWithDetails();
    mockedGenerateMatchingScheme.mockResolvedValue(matchingResult);
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
        specialRequirements: {
          dieCutting: false,
          punctureStrengthRequired: false,
          notes: undefined,
        },
        productionQuantity: "1000",
        stackingLayers: undefined,
      });
    });

    const economySlot = await screen.findByTestId("recommendation-slot-economy");
    const safetySlot = screen.getByTestId("recommendation-slot-safety");
    const balancedSlot = screen.getByTestId("recommendation-slot-balanced");

    expect(economySlot.textContent ?? "").toContain("经济型");
    expect(safetySlot.textContent ?? "").toContain("安全型");
    expect(balancedSlot.textContent ?? "").toContain("均衡型");
    expect(economySlot.textContent ?? "").toContain("3 层 B 楞");
    expect(economySlot.textContent ?? "").toContain("含税成本");
    expect(economySlot.textContent ?? "").toContain("2.13 元");
    expect(economySlot.textContent ?? "").toContain("空箱抗压");
    expect(economySlot.textContent ?? "").toContain("450 N");
    expect(screen.getByText("不推荐原因汇总")).toBeTruthy();
    expect(mockedSaveConfirmedMatchingScheme).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "选择经济型" }));
    expect(screen.getByText("当前最终方案：经济型")).toBeTruthy();

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
          specialRequirements: {
            dieCutting: false,
            punctureStrengthRequired: false,
          },
          productionQuantity: 1000,
        },
        originalRecommendationSlots: matchingResult.data.recommendationSlots,
        selectedStrategy: "economy",
        generationToken: matchingResult.data.generationToken,
      });
    });

    const savedPanel = await screen.findByTestId("saved-scheme-summary");

    expect(savedPanel.textContent ?? "").toContain("保存成功");
    expect(savedPanel.textContent ?? "").toContain("系统推荐方案");
    expect(savedPanel.textContent ?? "").toContain("scheme-1");
    expect(savedPanel.textContent ?? "").toContain("2026-07-02T00:00:00.000Z");
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
          specialRequirements: {
            dieCutting: false,
            punctureStrengthRequired: false,
          },
          productionQuantity: 1000,
        },
        originalRecommendationSlots: matchingResult.data.recommendationSlots,
        selectedStrategy: "economy",
        generationToken: matchingResult.data.generationToken,
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

  it("keeps selection reason visible after selecting a recommendation", async () => {
    const result = createMatchingResultWithDetails();
    result.data.recommendationSlots = result.data.recommendationSlots.map((slot, index) =>
      index === 0
        ? {
            ...slot,
            selectionReason: createSelectionReason(
              "模板生成",
              "在达标且可生产的候选中，优先选择成本更低的方案。",
            ),
          }
        : slot,
    );
    mockedGenerateMatchingScheme.mockResolvedValue(result);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));
    fireEvent.click(await screen.findByRole("button", { name: "选择经济型" }));

    const economyDetails = screen.getByTestId("recommendation-details-economy");
    const economySummary = economyDetails.querySelector("summary");
    expect(economySummary).toBeTruthy();
    fireEvent.click(economySummary!);

    expect(screen.getByText("当前最终方案：经济型")).toBeTruthy();
    expect(economyDetails).toHaveProperty("open", true);
    expect(economyDetails.textContent ?? "").toContain("选型理由");
    expect(economyDetails.textContent ?? "").toContain("模板生成");
    expect(economyDetails.textContent ?? "").toContain(
      "在达标且可生产的候选中，优先选择成本更低的方案。",
    );
  });

  it("does not expose manual adjustment or recalculation controls", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findAllByText("含税成本")).not.toHaveLength(0);
    expect(screen.queryByLabelText("调整瓦型")).toBeNull();
    expect(screen.queryByRole("button", { name: "重新校核" })).toBeNull();
    expect(screen.queryByText("待重新校核")).toBeNull();
  });

  it("keeps calculated recommendation values read-only on the page", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect((await screen.findAllByText("含税成本")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.13 元").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("含税成本")).toBeNull();
    expect(screen.queryByLabelText("耐破")).toBeNull();
    expect(screen.queryByLabelText("边压")).toBeNull();
    expect(screen.queryByLabelText("空箱抗压")).toBeNull();
    expect(screen.queryByLabelText("是否达标")).toBeNull();
    expect(screen.queryByLabelText("是否可生产")).toBeNull();
  });

  it("shows selection reason source labels and texts on recommendation cards", async () => {
    const result = createMatchingResultWithDetails();
    result.data.recommendationSlots = [
      {
        ...result.data.recommendationSlots[0]!,
        selectionReason: createSelectionReason("AI 生成", "成本较低，强度满足要求，可生产。"),
      },
      {
        ...result.data.recommendationSlots[1]!,
        selectionReason: createSelectionReason(
          "模板生成",
          "成本：该方案含税成本为 2.13 元。\n强度：空箱抗压 450 N。\n可生产状态：该方案当前为达标且可生产。\n风险提示：当前未发现强度或设备风险。",
          "provider_failed",
        ),
      },
      {
        ...result.data.recommendationSlots[2]!,
        selectionReason: createSelectionReason("模板生成", "风险提示：当前未发现强度或设备风险。"),
      },
    ];
    mockedGenerateMatchingScheme.mockResolvedValue(result);
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("AI 生成")).toBeTruthy();
    expect(screen.getAllByText("模板生成").length).toBeGreaterThan(0);
    expect(screen.getByText("成本较低，强度满足要求，可生产。")).toBeTruthy();
    expect(screen.getByText("在达标且可生产的候选中，优先选择安全冗余更高的方案。")).toBeTruthy();
    expect(screen.getByText("按成本和安全综合表现选择相对平衡的方案。")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain("该方案含税成本为 2.13 元");
    expect(document.body.textContent ?? "").not.toContain("空箱抗压 450 N");
    expect(document.body.textContent ?? "").not.toContain("provider_failed");
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
    expect(screen.queryByText("该组合同时也是某策略下最优")).toBeNull();
    expect(screen.getByText("不可用")).toBeTruthy();
    expect(screen.queryByText("没有更多不同的达标可生产候选组合")).toBeNull();
  });

  it("shows reference messages and reasons when no candidate is eligible", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createEmptyRecommendationResult());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("当前没有达标可生产方案，以下仅供调整参考")).toBeTruthy();
    expect(screen.getByText("参考方案")).toBeTruthy();
    expect(screen.queryByText("边压不足")).toBeNull();
    expect(screen.queryByText("所有安全型候选抗压富余率超过 200% 上限")).toBeNull();
    expect(screen.queryByText("没有可展示的参考方案")).toBeNull();
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

  it("hides rejected candidate details after generation while keeping summary", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createMatchingResultWithDetails());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("不推荐原因汇总")).toBeTruthy();
    expect(screen.queryByText("不可推荐候选明细")).toBeNull();
    expect(screen.queryByTestId("rejected-candidate-device-rejected")).toBeNull();
    expect(screen.queryByTestId("rejected-candidate-strength-rejected")).toBeNull();
    expect(
      screen.queryByText(
        "3 层 B 楞 - device-rejected-P1 / device-rejected-W1 / device-rejected-P2",
      ),
    ).toBeNull();
    expect(screen.queryByText("箱高超过设备限制")).toBeNull();
  });

  it("keeps matching page free of core calculation and recommendation formulas", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "(main)", "matching", "_components", "box-spec-form.tsx"),
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
