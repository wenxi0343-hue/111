import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type {
  PaperMaterialForUpdate,
  UpdatePaperMaterialRepository,
} from "@/modules/master-data/update-paper-material";
import { updatePaperMaterial } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-update-session-secret";
const validEnv = {
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_USERS_JSON: JSON.stringify([
    {
      username: "operator",
      displayName: "Operator",
      passwordHash: "scrypt$1024$8$1$c2FsdA$aGFzaA",
    },
  ]),
};

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "Operator",
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

class InMemoryUpdatePaperMaterialRepository implements UpdatePaperMaterialRepository {
  readonly changeLogs: MasterDataChangeLogRecord[] = [];

  constructor(private readonly materials: PaperMaterialForUpdate[]) {}

  async transaction<T>(run: (repository: UpdatePaperMaterialRepository) => Promise<T>): Promise<T> {
    return run(this);
  }

  async findPaperMaterialById(id: string) {
    return this.materials.find((material) => material.id === id);
  }

  async findPaperMaterialByCode(paperCode: string) {
    return this.materials.find((material) => material.paperCode === paperCode);
  }

  async updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialForUpdate, "id" | "factoryName">>,
  ) {
    const material = this.materials.find((item) => item.id === id);

    if (!material) {
      throw new Error("paper material not found");
    }

    Object.assign(material, input);

    return material;
  }

  async createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">) {
    this.changeLogs.push({
      id: `log-${this.changeLogs.length + 1}`,
      ...input,
    });
  }
}

function createMaterial(
  overrides: Partial<PaperMaterialForUpdate> = {},
): PaperMaterialForUpdate {
  return {
    id: "paper-1",
    paperCode: "r2",
    paperEncoding: "B04033",
    factoryId: "factory-1",
    factoryName: "Supplier A",
    name: "105g high strength corrugating",
    paperKind: "corrugating",
    grade: "A",
    gramWeightGsm: 105,
    usage: "base",
    applicableFlutes: ["B", "C"],
    priceYuanPerTon: 3300,
    burstIndex: 2.2,
    ringCrushIndex: 7.5,
    completenessStatus: "complete",
    missingFields: [],
    isActive: true,
    ...overrides,
  };
}

function createActionOptions(repository: UpdatePaperMaterialRepository) {
  return {
    env: validEnv,
    cookieStore: createAuthenticatedCookieStore(),
    updatePaperMaterialRepository: repository,
    now: new Date("2026-06-30T08:00:00.000Z"),
  };
}

describe("update paper material", () => {
  it("updates a non-critical auxiliary field without reason and writes change history", async () => {
    const repository = new InMemoryUpdatePaperMaterialRepository([createMaterial()]);

    const result = await updatePaperMaterial(
      {
        paperMaterialId: "paper-1",
        patch: {
          paperEncoding: "B04099",
        },
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    expect((await repository.findPaperMaterialById("paper-1"))?.paperEncoding).toBe("B04099");
    expect(repository.changeLogs).toHaveLength(1);
    expect(repository.changeLogs[0]).toMatchObject({
      entityType: "paper_material",
      entityId: "paper-1",
      changeSource: "manual",
      changedBy: "operator",
      changedFields: {
        paper_encoding: {
          before: "B04033",
          after: "B04099",
        },
      },
    });
    expect(repository.changeLogs[0]?.reason).toBeUndefined();
  });

  it("rejects a price change without reason", async () => {
    const repository = new InMemoryUpdatePaperMaterialRepository([createMaterial()]);

    const result = await updatePaperMaterial(
      {
        paperMaterialId: "paper-1",
        patch: {
          priceYuanPerTon: 3400,
        },
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("update should fail");
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("修改原因");
    expect((await repository.findPaperMaterialById("paper-1"))?.priceYuanPerTon).toBe(3300);
    expect(repository.changeLogs).toHaveLength(0);
  });

  it("updates price with reason and records old value, new value and reason", async () => {
    const repository = new InMemoryUpdatePaperMaterialRepository([createMaterial()]);

    const result = await updatePaperMaterial(
      {
        paperMaterialId: "paper-1",
        patch: {
          priceYuanPerTon: 3400,
        },
        reason: "供应商调价",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    expect((await repository.findPaperMaterialById("paper-1"))?.priceYuanPerTon).toBe(3400);
    expect(repository.changeLogs[0]).toMatchObject({
      reason: "供应商调价",
      changedFields: {
        price_yuan_per_ton: {
          before: 3300,
          after: 3400,
        },
      },
    });
  });

  it("rejects duplicate paper code", async () => {
    const repository = new InMemoryUpdatePaperMaterialRepository([
      createMaterial({ id: "paper-1", paperCode: "r2" }),
      createMaterial({ id: "paper-2", paperCode: "r3" }),
    ]);

    const result = await updatePaperMaterial(
      {
        paperMaterialId: "paper-1",
        patch: {
          paperCode: "r3",
        },
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("update should fail");
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("原纸代码重复");
    expect((await repository.findPaperMaterialById("paper-1"))?.paperCode).toBe("r2");
    expect(repository.changeLogs).toHaveLength(0);
  });

  it("turns completeness to complete after missing fields are filled", async () => {
    const repository = new InMemoryUpdatePaperMaterialRepository([
      createMaterial({
        priceYuanPerTon: undefined,
        burstIndex: undefined,
        ringCrushIndex: undefined,
        completenessStatus: "incomplete",
        missingFields: ["priceYuanPerTon", "burstIndex", "ringCrushIndex"],
      }),
    ]);

    const result = await updatePaperMaterial(
      {
        paperMaterialId: "paper-1",
        patch: {
          priceYuanPerTon: 3300,
          burstIndex: 2.2,
          ringCrushIndex: 7.5,
        },
        reason: "补齐缺失资料",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("update should succeed");
    }

    expect(result.data.completenessStatus).toBe("complete");
    expect(result.data.missingFields).toEqual([]);
    expect((await repository.findPaperMaterialById("paper-1"))).toMatchObject({
      completenessStatus: "complete",
      missingFields: [],
    });
  });
});
