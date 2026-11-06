import { describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { MatchingSchemeExportRecord } from "@/modules/import-export/matching-scheme-pdf-types";
import { createMatchingSchemePdfRouteHandler } from "@/app/api/exports/matching-schemes/[schemeId]/route";
import type {
  MatchingSchemeHistoryRecord,
  MatchingSchemeHistoryRecordInput,
  MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";

const sessionSecret = "matching-pdf-route-session-secret";
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

class InMemoryMatchingSchemeHistoryRepository implements MatchingSchemeHistoryRepository {
  records: MatchingSchemeHistoryRecord[];

  constructor(records: MatchingSchemeHistoryRecord[] = []) {
    this.records = records;
  }

  async saveAndPruneLatest(input: MatchingSchemeHistoryRecordInput) {
    const record = {
      id: `scheme-${this.records.length + 1}`,
      ...input,
      createdAt: input.createdAt ?? new Date("2026-07-02T00:00:00.000Z"),
    };

    this.records = [record, ...this.records];

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

class FailingAppendMatchingSchemeHistoryRepository extends InMemoryMatchingSchemeHistoryRepository {
  override async appendExportRecord(
    id: string,
    exportRecord: MatchingSchemeExportRecord,
  ): Promise<MatchingSchemeHistoryRecord | null> {
    void id;
    void exportRecord;
    throw new Error("C:\\internal\\matching-scheme-history.sql append failed");
  }
}

function createCookieStore(sessionValue?: string) {
  return {
    get(name: string) {
      return name === "paper_box_auth_session" && sessionValue ? { value: sessionValue } : undefined;
    },
  };
}

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now: new Date(),
  });

  return createCookieStore(session.value);
}

function createHistoryRecord(
  overrides: Partial<MatchingSchemeHistoryRecord> = {},
): MatchingSchemeHistoryRecord {
  const finalSchemeSnapshot = {
    status: "eligible",
    finalStatus: "qualified",
    warningMessages: [],
    candidate: {
      id: "final-scheme",
      layerCount: 3,
      fluteType: "B",
      layers: [
        {
          role: "outer_liner",
          paper: {
            id: "outer-paper",
            paperCode: "P1",
            factoryName: "一号纸厂",
            name: "A级面纸",
            gramWeightGsm: 200,
            priceYuanPerTon: 3000,
          },
        },
      ],
    },
    device: {
      isManufacturable: true,
      reasons: [],
    },
    strength: {
      burstStrength: 3800,
      edgeCrushKnPerM: 4.5,
      bctN: 520,
      isQualified: true,
      reasons: [],
    },
    cost: {
      utilizationRate: 0.88,
      layerUnitPrices: [],
      paperCostYuan: 1.2,
      processingFeeYuan: 0.9,
      taxYuan: 0.35,
      taxIncludedCostYuan: 2.45,
    },
  };

  return {
    id: "scheme-1",
    createdAt: new Date("2026-07-02T08:30:00.000Z"),
    boxSpecSnapshot: {
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
    originalRecommendationSlotsSnapshot: [
      {
        title: "经济型",
        evaluation: finalSchemeSnapshot,
      },
      {
        title: "安全型",
        evaluation: finalSchemeSnapshot,
      },
      {
        title: "均衡型",
        evaluation: finalSchemeSnapshot,
      },
    ],
    finalSchemeSnapshot,
    priceSnapshot: [],
    parameterVersion: "prd-v1-default",
    isManuallyAdjusted: false,
    exportRecords: [],
    confirmedBy: "operator",
    ...overrides,
  };
}

function createSelectionReason(sourceLabel: "AI 生成" | "模板生成", text: string) {
  return {
    source: sourceLabel === "AI 生成" ? "ai" : "template",
    sourceLabel,
    text,
    generatedAt: "2026-07-02T00:00:00.000Z",
  };
}

function createRequest(type: string) {
  return new Request(`http://localhost/api/exports/matching-schemes/scheme-1?type=${type}`);
}

async function readJson(response: Response) {
  return response.json() as Promise<{ message: string }>;
}

describe("matching scheme PDF export route", () => {
  it("returns full report PDF and appends export record for authenticated users", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF-full-report"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-07-02T10:30:00.000Z"),
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("full_report"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(decodeURIComponent(response.headers.get("Content-Disposition") ?? "")).toContain(
      "配纸方案-20260702-083000-完整报告.pdf",
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("%PDF-full-report");
    expect(generatePdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "full_report" }),
      }),
    );
    expect(repository.records[0]?.exportRecords).toEqual([
      { type: "full_report", exportedAt: "2026-07-02T10:30:00.000Z" },
    ]);
  });

  it("returns summary sheet PDF and appends summary export record", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-07-02T10:35:00.000Z"),
      generatePdfBuffer: async () => Buffer.from("%PDF-summary-sheet"),
    });

    const response = await handler.GET(createRequest("summary_sheet"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(decodeURIComponent(response.headers.get("Content-Disposition") ?? "")).toContain(
      "配纸方案-20260702-083000-精简方案表.pdf",
    );
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("%PDF-summary-sheet");
    expect(repository.records[0]?.exportRecords).toEqual([
      { type: "summary_sheet", exportedAt: "2026-07-02T10:35:00.000Z" },
    ]);
  });

  it("passes saved selection reason into generated PDF data", async () => {
    const record = createHistoryRecord();
    record.finalSchemeSnapshot = {
      ...record.finalSchemeSnapshot,
      selectionReason: createSelectionReason("AI 生成", "保存时的理由"),
    };
    const repository = new InMemoryMatchingSchemeHistoryRepository([record]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF-with-reason"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-07-02T10:35:00.000Z"),
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("summary_sheet"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(200);
    expect(generatePdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recommendationConclusion: expect.stringContaining("保存时的理由"),
        }),
      }),
    );
    expect(generatePdfBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recommendationConclusion: expect.stringContaining("AI 生成"),
        }),
      }),
    );
  });

  it("returns 401 and does not generate PDF when user is not authenticated", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createCookieStore(),
      repository,
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("full_report"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ message: "需要先登录" });
    expect(generatePdfBuffer).not.toHaveBeenCalled();
    expect(repository.records[0]?.exportRecords).toEqual([]);
  });

  it("returns 400 and skips PDF generation when export type is invalid", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("unknown"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ message: "导出类型无效" });
    expect(generatePdfBuffer).not.toHaveBeenCalled();
    expect(repository.records[0]?.exportRecords).toEqual([]);
  });

  it("hides internal PDF generation errors from the response", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const internalError = new Error("C:\\private\\pricing\\scheme.pdf failed with SQL detail");
    internalError.stack = "Error: hidden\n    at C:\\private\\pricing\\scheme.pdf:12:1";
    const generatePdfBuffer = vi.fn(async () => {
      throw internalError;
    });
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("full_report"), {
      params: { schemeId: "scheme-1" },
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body).toContain("导出失败，请稍后重试");
    expect(body).not.toContain("C:\\");
    expect(body).not.toContain("pricing");
    expect(body).not.toContain("SQL");
    expect(body).not.toContain("scheme.pdf:12");
    expect(repository.records[0]?.exportRecords).toEqual([]);
  });

  it("returns 500 instead of a PDF when export record append fails", async () => {
    const repository = new FailingAppendMatchingSchemeHistoryRepository([createHistoryRecord()]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF-should-not-be-returned"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("summary_sheet"), {
      params: { schemeId: "scheme-1" },
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body).toContain("导出失败，请稍后重试");
    expect(body).not.toContain("%PDF-should-not-be-returned");
    expect(repository.records[0]?.exportRecords).toEqual([]);
  });

  it("returns 404 when history record does not exist", async () => {
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository: new InMemoryMatchingSchemeHistoryRepository(),
      generatePdfBuffer: vi.fn(async () => Buffer.from("%PDF")),
    });

    const response = await handler.GET(createRequest("full_report"), {
      params: { schemeId: "missing-scheme" },
    });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ message: "方案记录不存在" });
  });

  it("returns 409 when history record is not qualified", async () => {
    const repository = new InMemoryMatchingSchemeHistoryRepository([
      createHistoryRecord({
        finalSchemeSnapshot: {
          finalStatus: "unqualified",
          warningMessages: ["最终方案未达标，不建议生产"],
        },
      }),
    ]);
    const generatePdfBuffer = vi.fn(async () => Buffer.from("%PDF"));
    const handler = createMatchingSchemePdfRouteHandler({
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      generatePdfBuffer,
    });

    const response = await handler.GET(createRequest("full_report"), {
      params: { schemeId: "scheme-1" },
    });

    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({ message: "当前方案不可导出" });
    expect(generatePdfBuffer).not.toHaveBeenCalled();
    expect(repository.records[0]?.exportRecords).toEqual([]);
  });
});
