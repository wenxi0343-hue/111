// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MatchingPage from "@/app/(main)/matching/page";
import { STACKING_NOT_REQUIRED_DISPLAY_TEXT } from "@/modules/box-spec/constants";
import type {
  BoardAreaResult,
  CostResult,
  MatchingCandidate,
  StrengthResult,
} from "@/modules/calculations/types";
import { generateMatchingScheme, type GenerateMatchingSchemeResult } from "@/server/actions/matching-actions";

const actionMocks = vi.hoisted(() => ({
  generateMatchingScheme: vi.fn(),
}));

vi.mock("@/server/actions/matching-actions", () => ({
  generateMatchingScheme: actionMocks.generateMatchingScheme,
}));

const mockedGenerateMatchingScheme = vi.mocked(generateMatchingScheme);

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
      recommendations: [],
      rejectedSummary: [],
      rejectedCandidates: [],
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
      recommendations: [],
      rejectedSummary: [],
      rejectedCandidates: [],
      stackingDisplayText: "已纳入堆码承重校核",
    },
  };
}

function createMatchingResultWithDetails(): { ok: true; data: GenerateMatchingSchemeResult } {
  const eligibleCandidate = createCandidate("eligible");
  const deviceRejectedCandidate = createCandidate("device-rejected");
  const strengthRejectedCandidate = createCandidate("strength-rejected");

  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendations: [
        {
          status: "eligible",
          candidate: eligibleCandidate,
          area: createArea(),
          device: {
            isManufacturable: true,
            reasons: [],
          },
          strength: createStrength(),
          cost: createCost(),
        },
      ],
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
  return {
    ok: true,
    data: {
      ...createSuccessResult().data,
      recommendations: [],
      rejectedSummary: [{ type: "STRENGTH_UNQUALIFIED", label: "强度不达标", count: 1 }],
      rejectedCandidates: [
        {
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
            reasons: [
              { type: "STRENGTH_UNQUALIFIED", code: "ECT_TOO_LOW", message: "边压不足" },
            ],
          },
          cost: createCost(),
        },
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
    mockedGenerateMatchingScheme.mockResolvedValue(createSuccessResult());
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
    expect(screen.getByText("3 层 B 楞")).toBeTruthy();
    expect(screen.getAllByText("面积 0.8905 m²").length).toBeGreaterThan(0);
    expect(screen.getAllByText("空箱抗压 450 N").length).toBeGreaterThan(0);
    expect(screen.getAllByText("边压 4.50 kN/m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("含税成本 2.13 元").length).toBeGreaterThan(0);
  });

  it("shows an empty recommendation message when no candidate is eligible", async () => {
    mockedGenerateMatchingScheme.mockResolvedValue(createEmptyRecommendationResult());
    render(<MatchingPage />);

    fillValidBoxSpecForm();
    fireEvent.click(screen.getByRole("button", { name: "生成方案" }));

    expect(await screen.findByText("当前没有达标且可生产的推荐方案")).toBeTruthy();
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
});
