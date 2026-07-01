import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type { MasterDataChangeLogRepository } from "@/modules/master-data/change-log";
import { getMasterDataChangeHistory } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-change-history-session-secret";
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

class InMemoryMasterDataChangeLogRepository implements MasterDataChangeLogRepository {
  constructor(private readonly logs: MasterDataChangeLogRecord[]) {}

  async listChangeLogs(input: { entityType: string; entityId: string }) {
    return this.logs.filter(
      (log) => log.entityType === input.entityType && log.entityId === input.entityId,
    );
  }
}

function createChangeLog(
  overrides: Partial<MasterDataChangeLogRecord> = {},
): MasterDataChangeLogRecord {
  return {
    id: "log-1",
    entityType: "paper_material",
    entityId: "paper-1",
    changeSource: "manual",
    changedFields: {
      price_yuan_per_ton: {
        before: 3300,
        after: 3400,
      },
    },
    reason: "供应商调价",
    changedBy: "operator",
    createdAt: new Date("2026-06-30T08:00:00.000Z"),
    ...overrides,
  };
}

function createActionOptions(repository: MasterDataChangeLogRepository) {
  return {
    env: validEnv,
    cookieStore: createAuthenticatedCookieStore(),
    changeLogRepository: repository,
  };
}

describe("change history", () => {
  it("returns import and manual history in descending time order", async () => {
    const repository = new InMemoryMasterDataChangeLogRepository([
      createChangeLog({
        id: "import-log",
        changeSource: "import",
        changedFields: {
          paper_code: {
            before: null,
            after: "r2",
          },
        },
        createdAt: new Date("2026-06-29T08:00:00.000Z"),
      }),
      createChangeLog({
        id: "manual-log",
        changeSource: "manual",
        createdAt: new Date("2026-06-30T08:00:00.000Z"),
      }),
    ]);

    const result = await getMasterDataChangeHistory(
      {
        entityType: "paper_material",
        entityId: "paper-1",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history should succeed");
    }

    expect(result.data.items.map((item) => item.id)).toEqual(["manual-log", "import-log"]);
  });

  it("keeps price change old value, new value, operator, time and reason", async () => {
    const repository = new InMemoryMasterDataChangeLogRepository([
      createChangeLog({
        id: "price-log",
        changedBy: "operator",
        reason: "供应商调价",
        createdAt: new Date("2026-06-30T08:00:00.000Z"),
      }),
    ]);

    const result = await getMasterDataChangeHistory(
      {
        entityType: "paper_material",
        entityId: "paper-1",
      },
      createActionOptions(repository),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("history should succeed");
    }

    expect(result.data.items[0]).toMatchObject({
      id: "price-log",
      changedBy: "operator",
      reason: "供应商调价",
      changedFields: {
        price_yuan_per_ton: {
          before: 3300,
          after: 3400,
        },
      },
    });
    expect(result.data.items[0]?.createdAt?.toISOString()).toBe("2026-06-30T08:00:00.000Z");
  });

  it("returns an empty list for a paper material without history", async () => {
    const repository = new InMemoryMasterDataChangeLogRepository([
      createChangeLog({ entityId: "paper-1" }),
    ]);

    const result = await getMasterDataChangeHistory(
      {
        entityType: "paper_material",
        entityId: "missing-paper",
      },
      createActionOptions(repository),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        items: [],
      },
    });
  });
});
