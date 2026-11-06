import { describe, expect, it } from "vitest";

import { STACKING_NOT_REQUIRED_DISPLAY_TEXT } from "@/modules/box-spec/constants";
import type { NormalizedBoxSpec } from "@/modules/box-spec/types";
import type { RecommendationSlot } from "@/modules/recommendation/types";
import {
  createGenerationToken,
  verifyGenerationToken,
} from "@/modules/recommendation/generation-token";

const secret = "test-generation-secret";

function createBoxSpec(overrides: Partial<NormalizedBoxSpec> = {}): NormalizedBoxSpec {
  return {
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
    ...overrides,
  };
}

function createSlot(strategy: RecommendationSlot["strategy"]): RecommendationSlot {
  return {
    strategy,
    title: strategy === "economy" ? "经济型" : strategy === "safety" ? "安全型" : "均衡型",
    status: "recommended",
    isOfficialRecommendation: true,
    evaluation: {
      status: "eligible",
      candidate: {
        id: strategy,
        layerCount: 3,
        fluteType: "B",
        layers: [
          {
            role: "outer_liner",
            paper: { id: `${strategy}-outer`, paperCode: "P1" },
          },
          {
            role: "corrugating",
            flute: "B",
            paper: { id: `${strategy}-corrugating`, paperCode: "W1" },
          },
          {
            role: "inner_liner",
            paper: { id: `${strategy}-inner`, paperCode: "P2" },
          },
        ],
      },
      area: {} as never,
      device: {} as never,
      strength: {} as never,
      cost: {} as never,
    },
    messages: [],
    unavailableReasons: [],
  };
}

describe("generation token", () => {
  it("validates the same normalized box spec and recommendation slots", () => {
    const boxSpec = createBoxSpec();
    const slots = [createSlot("economy"), createSlot("safety"), createSlot("balanced")];
    const token = createGenerationToken({ boxSpec, slots, secret });

    expect(
      verifyGenerationToken({
        boxSpec,
        slots,
        selectedStrategy: "economy",
        token,
        secret,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a token when the selected slot candidate changes", () => {
    const boxSpec = createBoxSpec();
    const slots = [createSlot("economy"), createSlot("safety"), createSlot("balanced")];
    const token = createGenerationToken({ boxSpec, slots, secret });
    const tamperedSlots = [
      {
        ...slots[0],
        evaluation: {
          ...slots[0]?.evaluation,
          candidate: {
            ...slots[0]?.evaluation?.candidate,
            layers: [
              {
                role: "outer_liner",
                paper: { id: "changed-paper", paperCode: "CHANGED" },
              },
            ],
          },
        },
      },
      slots[1],
      slots[2],
    ] as RecommendationSlot[];

    expect(
      verifyGenerationToken({
        boxSpec,
        slots: tamperedSlots,
        selectedStrategy: "economy",
        token,
        secret,
      }),
    ).toEqual({ ok: false, message: "请重新生成方案后保存" });
  });

  it("rejects a token when box dimensions change", () => {
    const boxSpec = createBoxSpec();
    const slots = [createSlot("economy"), createSlot("safety"), createSlot("balanced")];
    const token = createGenerationToken({ boxSpec, slots, secret });

    expect(
      verifyGenerationToken({
        boxSpec: createBoxSpec({ lengthMm: 501 }),
        slots,
        selectedStrategy: "economy",
        token,
        secret,
      }),
    ).toEqual({ ok: false, message: "请重新生成方案后保存" });
  });
});
