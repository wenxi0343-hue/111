import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type {
  PaperMaterialActiveRecord,
  SetPaperMaterialActiveRepository,
} from "@/modules/master-data/set-paper-material-active";
import { setPaperMaterialActive } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-active-session-secret";
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

class InMemorySetPaperMaterialActiveRepository
  implements SetPaperMaterialActiveRepository
{
  readonly changeLogs: MasterDataChangeLogRecord[] = [];

  constructor(private readonly materials: PaperMaterialActiveRecord[]) {}

  async transaction<T>(
    run: (repository: SetPaperMaterialActiveRepository) => Promise<T>,
  ): Promise<T> {
    return run(this);
  }

  async findPaperMaterialById(id: string) {
    return this.materials.find((material) => material.id === id);
  }

  async updatePaperMaterialActive(id: string, isActive: boolean) {
    const material = this.materials.find((item) => item.id === id);

    if (!material) {
      throw new Error("paper material not found");
    }

    material.isActive = isActive;

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
  overrides: Partial<PaperMaterialActiveRecord> = {},
): PaperMaterialActiveRecord {
  return {
    id: "paper-1",
    isActive: true,
    ...overrides,
  };
}

function createActionOptions(repository: SetPaperMaterialActiveRepository) {
  return {
    env: validEnv,
    cookieStore: createAuthenticatedCookieStore(),
    setPaperMaterialActiveRepository: repository,
    now: new Date("2026-06-30T08:00:00.000Z"),
  };
}

describe("set paper material active", () => {
  it("rejects deactivation without reason", async () => {
    const repository = new InMemorySetPaperMaterialActiveRepository([createMaterial()]);

    const result = await setPaperMaterialActive(
      {
        paperMaterialId: "paper-1",
        isActive: false,
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("set active should fail");
    }

    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toContain("原因");
    expect((await repository.findPaperMaterialById("paper-1"))?.isActive).toBe(true);
    expect(repository.changeLogs).toHaveLength(0);
  });

  it("deactivates paper material with reason and writes change history", async () => {
    const repository = new InMemorySetPaperMaterialActiveRepository([createMaterial()]);

    const result = await setPaperMaterialActive(
      {
        paperMaterialId: "paper-1",
        isActive: false,
        reason: "停止采购",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    expect((await repository.findPaperMaterialById("paper-1"))?.isActive).toBe(false);
    expect(repository.changeLogs[0]).toMatchObject({
      entityType: "paper_material",
      entityId: "paper-1",
      changeSource: "manual",
      changedBy: "operator",
      reason: "停止采购",
      changedFields: {
        is_active: {
          before: true,
          after: false,
        },
      },
    });
  });

  it("reactivates paper material with reason and writes change history", async () => {
    const repository = new InMemorySetPaperMaterialActiveRepository([
      createMaterial({ isActive: false }),
    ]);

    const result = await setPaperMaterialActive(
      {
        paperMaterialId: "paper-1",
        isActive: true,
        reason: "恢复采购",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    expect((await repository.findPaperMaterialById("paper-1"))?.isActive).toBe(true);
    expect(repository.changeLogs[0]).toMatchObject({
      reason: "恢复采购",
      changedFields: {
        is_active: {
          before: false,
          after: true,
        },
      },
    });
  });
});
