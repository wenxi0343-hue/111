import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type {
  ListPaperMaterialsRepository,
  NormalizedListPaperMaterialsQuery,
  PaperMaterialListItem,
} from "@/modules/master-data/list-paper-materials";
import { listPaperMaterials } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-list-session-secret";
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

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now: new Date("2026-06-30T00:00:00.000Z"),
  });

  return {
    get(name: string) {
      return name === "paper_box_auth_session" ? { value: session.value } : undefined;
    },
  };
}

class InMemoryPaperMaterialListRepository implements ListPaperMaterialsRepository {
  constructor(private readonly materials: PaperMaterialListItem[]) {}

  async listPaperMaterials(query: NormalizedListPaperMaterialsQuery) {
    let items = [...this.materials];

    if (query.completenessStatus) {
      items = items.filter((item) => item.completenessStatus === query.completenessStatus);
    }

    if (query.isActive !== undefined) {
      items = items.filter((item) => item.isActive === query.isActive);
    }

    if (query.paperKind) {
      items = items.filter((item) => item.paperKind === query.paperKind);
    }

    if (query.factoryId) {
      items = items.filter((item) => item.factoryId === query.factoryId);
    }

    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();

      items = items.filter(
        (item) =>
          item.paperCode.toLowerCase().includes(keyword) ||
          item.name.toLowerCase().includes(keyword) ||
          item.factoryName.toLowerCase().includes(keyword),
      );
    }

    return {
      items: items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: items.length,
    };
  }
}

function createMaterial(overrides: Partial<PaperMaterialListItem> = {}): PaperMaterialListItem {
  return {
    id: "paper-1",
    paperCode: "r2",
    paperEncoding: "B04033",
    factoryId: "factory-1",
    factoryName: "供应商A",
    name: "105g高强瓦楞纸",
    paperKind: "corrugating",
    grade: "A",
    gramWeightGsm: 105,
    priceYuanPerTon: 3300,
    burstIndex: 2.2,
    ringCrushIndex: 7.5,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

describe("list paper materials", () => {
  it("returns complete and incomplete paper materials with completeness status", async () => {
    const repository = new InMemoryPaperMaterialListRepository([
      createMaterial({ id: "paper-1", paperCode: "r2", completenessStatus: "complete" }),
      createMaterial({
        id: "paper-2",
        paperCode: "r3",
        completenessStatus: "incomplete",
        priceYuanPerTon: undefined,
        burstIndex: undefined,
        ringCrushIndex: undefined,
        missingFields: ["priceYuanPerTon", "burstIndex", "ringCrushIndex"],
      }),
    ]);

    const result = await listPaperMaterials(
      { page: 1, pageSize: 20 },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialListRepository: repository,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("list should succeed");
    }

    expect(result.data.total).toBe(2);
    expect(result.data.items).toEqual([
      expect.objectContaining({ paperCode: "r2", completenessStatus: "complete" }),
      expect.objectContaining({ paperCode: "r3", completenessStatus: "incomplete" }),
    ]);
  });

  it("filters incomplete paper materials and keeps missing strength and price fields", async () => {
    const repository = new InMemoryPaperMaterialListRepository([
      createMaterial({ id: "paper-1", paperCode: "r2", completenessStatus: "complete" }),
      createMaterial({
        id: "paper-2",
        paperCode: "r3",
        completenessStatus: "incomplete",
        priceYuanPerTon: undefined,
        burstIndex: undefined,
        ringCrushIndex: undefined,
        missingFields: ["priceYuanPerTon", "burstIndex", "ringCrushIndex"],
      }),
    ]);

    const result = await listPaperMaterials(
      { completenessStatus: "incomplete", page: 1, pageSize: 20 },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        paperMaterialListRepository: repository,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("list should succeed");
    }

    expect(result.data.total).toBe(1);
    expect(result.data.items[0]).toMatchObject({
      paperCode: "r3",
      completenessStatus: "incomplete",
      missingFields: ["priceYuanPerTon", "burstIndex", "ringCrushIndex"],
    });
  });
});
