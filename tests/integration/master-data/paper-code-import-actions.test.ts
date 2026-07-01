import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type {
  MasterDataChangeLogRecord,
  MasterDataImportBatchRecord,
  MasterDataImportRepository,
  MasterDataImportRowRecord,
  PaperFactoryRecord,
  PaperMaterialRecord,
  PaperMaterialMatchRuleRecord,
  PaperMaterialPriceHistoryRecord,
  PaperQualityStandardRecord,
} from "@/modules/master-data/import-commit";
import {
  confirmMasterDataImport,
  getMasterDataChangeHistory,
  previewMasterDataImport,
} from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-import-session-secret";
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

function createCookieStore(sessionValue?: string) {
  return {
    get(name: string) {
      return name === "paper_box_auth_session" && sessionValue
        ? { value: sessionValue }
        : undefined;
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
    now: new Date("2026-06-29T00:00:00.000Z"),
  });

  return createCookieStore(session.value);
}

async function createPaperCodeWorkbookFile(rows: string[][]): Promise<File> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("原纸代码");

  worksheet.addRow(["说明：原纸代码表"]);
  worksheet.addRow(["原纸代码", "原纸编码", "克重", "原纸供应商简称", "原纸名称"]);

  for (const row of rows) {
    worksheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer);

  return new File([bytes], "原纸代码表.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function createPaperCodeImportFormData(rows: string[][]): Promise<FormData> {
  const formData = new FormData();

  formData.set("sourceType", "paper_code_table");
  formData.set("file", await createPaperCodeWorkbookFile(rows));

  return formData;
}

class InMemoryMasterDataImportRepository implements MasterDataImportRepository {
  batches: MasterDataImportBatchRecord[] = [];
  rows: MasterDataImportRowRecord[] = [];
  factories: PaperFactoryRecord[] = [];
  materials: PaperMaterialRecord[] = [];
  changeLogs: MasterDataChangeLogRecord[] = [];
  matchRules: PaperMaterialMatchRuleRecord[] = [];
  priceHistories: PaperMaterialPriceHistoryRecord[] = [];
  qualityStandards: PaperQualityStandardRecord[] = [];

  async transaction<T>(run: (repository: MasterDataImportRepository) => Promise<T>): Promise<T> {
    return run(this);
  }

  async listPaperMaterialsForPreview(): Promise<PaperMaterialRecord[]> {
    return this.materials;
  }

  async saveImportPreview(input: {
    sourceType: string;
    fileName: string;
    summary: MasterDataImportBatchRecord["summary"];
    rows: Array<Omit<MasterDataImportRowRecord, "id" | "batchId">>;
    createdBy: string;
  }): Promise<{ batchId: string }> {
    const batchId = `batch-${this.batches.length + 1}`;

    this.batches.push({
      id: batchId,
      sourceType: input.sourceType,
      fileName: input.fileName,
      status: "previewed",
      summary: input.summary,
      createdBy: input.createdBy,
    });

    this.rows.push(
      ...input.rows.map((row, index) => ({
        ...row,
        id: `row-${this.rows.length + index + 1}`,
        batchId,
      })),
    );

    return { batchId };
  }

  async findImportBatchById(batchId: string): Promise<MasterDataImportBatchRecord | undefined> {
    return this.batches.find((batch) => batch.id === batchId);
  }

  async listImportRowsByBatchId(batchId: string): Promise<MasterDataImportRowRecord[]> {
    return this.rows.filter((row) => row.batchId === batchId);
  }

  async findImportRowById(input: {
    batchId: string;
    rowId: string;
  }): Promise<MasterDataImportRowRecord | undefined> {
    return this.rows.find((row) => row.batchId === input.batchId && row.id === input.rowId);
  }

  async updateImportRowMatch(input: {
    batchId: string;
    rowId: string;
    targetMaterialId: string;
    rowStatus: "update";
  }): Promise<MasterDataImportRowRecord> {
    const row = await this.findImportRowById(input);

    if (!row) {
      throw new Error("row not found");
    }

    row.rowStatus = input.rowStatus;
    row.targetMaterialId = input.targetMaterialId;
    row.errors = [];

    return row;
  }

  async findPaperMaterialById(id: string): Promise<PaperMaterialRecord | undefined> {
    return this.materials.find((material) => material.id === id);
  }

  async findPaperMaterialByCode(paperCode: string): Promise<PaperMaterialRecord | undefined> {
    return this.materials.find((material) => material.paperCode === paperCode);
  }

  async findPaperFactoryByName(name: string): Promise<PaperFactoryRecord | undefined> {
    return this.factories.find((factory) => factory.name === name);
  }

  async createPaperFactory(input: { name: string }): Promise<PaperFactoryRecord> {
    const factory = {
      id: `factory-${this.factories.length + 1}`,
      name: input.name,
      supplyTypes: [],
      isActive: true,
    };

    this.factories.push(factory);

    return factory;
  }

  async createPaperMaterial(
    input: Omit<PaperMaterialRecord, "id" | "factoryName">,
  ): Promise<PaperMaterialRecord> {
    const factory = this.factories.find((item) => item.id === input.factoryId);
    const material = {
      ...input,
      id: `material-${this.materials.length + 1}`,
      factoryName: factory?.name,
    };

    this.materials.push(material);

    return material;
  }

  async updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialRecord, "id">>,
  ): Promise<PaperMaterialRecord> {
    const materialIndex = this.materials.findIndex((material) => material.id === id);

    if (materialIndex < 0) {
      throw new Error("material not found");
    }

    const currentMaterial = this.materials[materialIndex];

    if (!currentMaterial) {
      throw new Error("material not found");
    }

    const nextMaterial: PaperMaterialRecord = {
      ...currentMaterial,
      ...input,
    };

    this.materials[materialIndex] = nextMaterial;

    return nextMaterial;
  }

  async createMatchRule(
    input: Omit<PaperMaterialMatchRuleRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialMatchRuleRecord> {
    const rule = {
      ...input,
      id: `match-rule-${this.matchRules.length + 1}`,
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
    };

    this.matchRules.push(rule);

    return rule;
  }

  async createPriceHistory(
    input: Omit<PaperMaterialPriceHistoryRecord, "id" | "createdAt">,
  ): Promise<PaperMaterialPriceHistoryRecord> {
    const history = {
      ...input,
      id: `price-history-${this.priceHistories.length + 1}`,
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
    };

    this.priceHistories.push(history);

    return history;
  }

  async createQualityStandard(
    input: Omit<PaperQualityStandardRecord, "id" | "createdAt">,
  ): Promise<PaperQualityStandardRecord> {
    const standard = {
      ...input,
      id: `quality-standard-${this.qualityStandards.length + 1}`,
      createdAt: new Date("2026-06-30T00:00:00.000Z"),
    };

    this.qualityStandards.push(standard);

    return standard;
  }

  async createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void> {
    this.changeLogs.push({
      ...input,
      id: `change-log-${this.changeLogs.length + 1}`,
    });
  }

  async markImportBatchConfirmed(input: {
    batchId: string;
    confirmedBy: string;
    confirmedAt: Date;
  }): Promise<void> {
    const batch = this.batches.find((item) => item.id === input.batchId);

    if (!batch) {
      return;
    }

    batch.status = "confirmed";
    batch.confirmedBy = input.confirmedBy;
    batch.confirmedAt = input.confirmedAt;
  }

  async listChangeLogs(input: {
    entityType: string;
    entityId: string;
  }): Promise<MasterDataChangeLogRecord[]> {
    return this.changeLogs.filter(
      (log) => log.entityType === input.entityType && log.entityId === input.entityId,
    );
  }
}

describe("paper code import server actions", () => {
  it("does not parse or save rows when preview is called without login", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
    ]);

    const result = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createCookieStore(),
      repository,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "需要先登录",
      },
    });
    expect(repository.batches).toHaveLength(0);
    expect(repository.rows).toHaveLength(0);
  });

  it("saves a paper code import preview batch for a valid workbook", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
    ]);

    const result = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("preview should succeed");
    }

    expect(result.data.batchId).toBe("batch-1");
    expect(result.data.summary).toEqual({
      newCount: 1,
      updateCount: 0,
      pendingCount: 0,
      failedCount: 0,
      incompleteCount: 1,
    });
    expect(repository.batches[0]).toMatchObject({
      id: "batch-1",
      sourceType: "paper_code_table",
      fileName: "原纸代码表.xlsx",
      status: "previewed",
      createdBy: "operator",
    });
    expect(repository.rows[0]).toMatchObject({
      batchId: "batch-1",
      rowStatus: "new",
      rowNumber: 3,
      normalizedData: {
        paperCode: "r2",
        paperEncoding: "B04033",
        gramWeightGsm: 105,
        supplierShortName: "供应商A",
        paperName: "105g高强瓦楞纸",
      },
    });
  });

  it("confirms a preview batch by creating factories, paper materials, and import change logs", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
      ["a未", "B05001", "120", "供应商B", "120g测试面纸"],
    ]);
    const previewResult = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) {
      throw new Error("preview should succeed");
    }

    const confirmResult = await confirmMasterDataImport(previewResult.data.batchId, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-06-29T08:00:00.000Z"),
    });

    expect(confirmResult).toEqual({
      ok: true,
      data: {
        batchId: "batch-1",
        createdFactoryCount: 2,
        createdMaterialCount: 2,
        updatedMaterialCount: 0,
        skippedFailedRowCount: 0,
      },
    });
    expect(repository.batches[0]?.status).toBe("confirmed");
    expect(repository.factories.map((factory) => factory.name)).toEqual(["供应商A", "供应商B"]);
    expect(repository.materials.map((material) => material.paperCode)).toEqual(["r2", "a未"]);
    expect(repository.materials[0]).toMatchObject({
      paperEncoding: "B04033",
      name: "105g高强瓦楞纸",
      gramWeightGsm: 105,
      completenessStatus: "incomplete",
      missingFields: expect.arrayContaining(["paperKind", "priceYuanPerTon", "burstIndex"]),
    });
    expect(repository.changeLogs).toHaveLength(2);
    expect(repository.changeLogs[0]).toMatchObject({
      entityType: "paper_material",
      entityId: "material-1",
      changeSource: "import",
      importBatchId: "batch-1",
      changedBy: "operator",
    });
  });

  it("rejects confirming an already confirmed batch without creating duplicate materials", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
    ]);
    const previewResult = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) {
      throw new Error("preview should succeed");
    }

    await confirmMasterDataImport(previewResult.data.batchId, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });
    const secondResult = await confirmMasterDataImport(previewResult.data.batchId, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(secondResult).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "该导入批次已确认或不可确认",
      },
    });
    expect(repository.materials).toHaveLength(1);
  });

  it("rejects confirmation when a new row conflicts with an existing paper code", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
    ]);
    const previewResult = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    repository.factories.push({
      id: "existing-factory",
      name: "其他供应商",
      supplyTypes: [],
      isActive: true,
    });
    repository.materials.push({
      id: "existing-material",
      paperCode: "r2",
      paperEncoding: "OLD",
      factoryId: "existing-factory",
      factoryName: "其他供应商",
      name: "已有原纸",
      paperKind: "unknown",
      gramWeightGsm: 100,
      applicableFlutes: [],
      completenessStatus: "incomplete",
      missingFields: [],
      isActive: true,
    });

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) {
      throw new Error("preview should succeed");
    }

    const confirmResult = await confirmMasterDataImport(previewResult.data.batchId, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(confirmResult).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "原纸代码 r2 已存在，请重新预览后再确认",
      },
    });
    expect(repository.materials).toHaveLength(1);
    expect(repository.materials[0]?.name).toBe("已有原纸");
  });

  it("returns import change history for a confirmed paper material", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    const formData = await createPaperCodeImportFormData([
      ["r2", "B04033", "105", "供应商A", "105g高强瓦楞纸"],
    ]);
    const previewResult = await previewMasterDataImport(formData, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(previewResult.ok).toBe(true);
    if (!previewResult.ok) {
      throw new Error("preview should succeed");
    }

    await confirmMasterDataImport(previewResult.data.batchId, {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    const historyResult = await getMasterDataChangeHistory(
      {
        entityType: "paper_material",
        entityId: "material-1",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(historyResult.ok).toBe(true);
    if (!historyResult.ok) {
      throw new Error("history should succeed");
    }

    expect(historyResult.data.items).toEqual([
      expect.objectContaining({
        changeSource: "import",
        changedBy: "operator",
        changedFields: expect.objectContaining({
          paperCode: { before: null, after: "r2" },
          gramWeightGsm: { before: null, after: 105 },
        }),
      }),
    ]);
  });
});
