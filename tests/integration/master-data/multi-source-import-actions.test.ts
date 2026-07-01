import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type {
  MasterDataChangeLogRecord,
  MasterDataImportBatchRecord,
  MasterDataImportRepository,
  MasterDataImportRowRecord,
  PaperFactoryRecord,
  PaperMaterialMatchRuleRecord,
  PaperMaterialPriceHistoryRecord,
  PaperMaterialRecord,
  PaperQualityStandardRecord,
} from "@/modules/master-data/import-commit";
import { previewMasterDataImport } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-multi-source-session-secret";
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

async function createWorkbookFile(
  workbook: Workbook,
  fileName: string,
): Promise<File> {
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer);

  return new File([bytes], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function createPriceFormData(rows: Array<[string, string, number]>): Promise<FormData> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("23-3");

  worksheet.addRow(["供应商", "原纸品种", "3.8纸价"]);
  for (const row of rows) {
    worksheet.addRow(row);
  }

  const formData = new FormData();

  formData.set("sourceType", "paper_price_table");
  formData.set("file", await createWorkbookFile(workbook, "纸价.xlsx"));

  return formData;
}

async function createQualityFormData(): Promise<FormData> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("瓦纸标准");

  worksheet.addRow(["物理指标", "单位", "等级", "克重下限", "克重上限", "标准值"]);
  worksheet.addRow(["耐破指数", "kPa", "A", 100, 120, 2.2]);
  worksheet.addRow(["横向环压指数", "N.m/g", "A", 100, 120, 7.5]);

  const formData = new FormData();

  formData.set("sourceType", "quality_standard_table");
  formData.set("file", await createWorkbookFile(workbook, "质量标准.xlsx"));

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
    const material = {
      ...input,
      id: `material-${this.materials.length + 1}`,
      factoryName: this.factories.find((factory) => factory.id === input.factoryId)?.name,
    };

    this.materials.push(material);

    return material;
  }

  async updatePaperMaterial(
    id: string,
    input: Partial<Omit<PaperMaterialRecord, "id">>,
  ): Promise<PaperMaterialRecord> {
    const material = await this.findPaperMaterialById(id);

    if (!material) {
      throw new Error("material not found");
    }

    Object.assign(material, input);

    return material;
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

function addExistingMaterial(
  repository: InMemoryMasterDataImportRepository,
  overrides: Partial<PaperMaterialRecord> = {},
) {
  repository.materials.push({
    id: "paper-1",
    paperCode: "r2",
    paperEncoding: "B04033",
    factoryId: "factory-1",
    factoryName: "供应商A",
    name: "105g高强瓦楞纸",
    paperKind: "corrugating",
    grade: "A",
    gramWeightGsm: 105,
    applicableFlutes: [],
    priceYuanPerTon: 3200,
    completenessStatus: "incomplete",
    missingFields: ["burstIndex", "ringCrushIndex"],
    isActive: true,
    ...overrides,
  });
}

describe("multi-source master data import preview actions", () => {
  it("saves a paper price preview through the shared upload action", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);

    const result = await previewMasterDataImport(
      await createPriceFormData([["供应商A", "105g高强瓦楞纸", 3230]]),
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("price preview should succeed");
    }

    expect(result.data.sourceType).toBe("paper_price_table");
    expect(result.data.summary).toMatchObject({
      updateCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(repository.batches[0]).toMatchObject({
      sourceType: "paper_price_table",
      fileName: "纸价.xlsx",
      createdBy: "operator",
    });
    expect(repository.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
      normalizedData: {
        supplierShortName: "供应商A",
        paperName: "105g高强瓦楞纸",
        prices: [{ effectiveDate: "03-08", priceYuanPerTon: 3230 }],
      },
      changeSet: {
        price_yuan_per_ton: { before: 3200, after: 3230 },
      },
    });
  });

  it("keeps ambiguous paper price matches pending with candidate material ids", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository, { id: "paper-1", paperCode: "r2" });
    addExistingMaterial(repository, { id: "paper-2", paperCode: "r3" });

    const result = await previewMasterDataImport(
      await createPriceFormData([["供应商A", "105g高强瓦楞纸", 3230]]),
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("price preview should succeed");
    }

    expect(result.data.summary.pendingCount).toBe(1);
    expect(repository.rows[0]).toMatchObject({
      rowStatus: "pending",
      candidateMaterialIds: ["paper-1", "paper-2"],
    });
  });

  it("saves a quality standard preview and updates a uniquely matched material", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);

    const result = await previewMasterDataImport(await createQualityFormData(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("quality preview should succeed");
    }

    expect(result.data.sourceType).toBe("quality_standard_table");
    expect(result.data.summary).toMatchObject({
      updateCount: 1,
      pendingCount: 0,
      failedCount: 0,
    });
    expect(repository.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
      normalizedData: {
        paperKind: "corrugating",
        grade: "A",
        gramWeightMinGsm: 100,
        gramWeightMaxGsm: 120,
        burstIndex: 2.2,
        ringCrushIndex: 7.5,
      },
      changeSet: {
        burst_index: { before: null, after: 2.2 },
        ring_crush_index: { before: null, after: 7.5 },
      },
    });
  });

  it("keeps unmatched quality standards as standard rules", async () => {
    const repository = new InMemoryMasterDataImportRepository();

    const result = await previewMasterDataImport(await createQualityFormData(), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("quality preview should succeed");
    }

    expect(result.data.summary.pendingCount).toBe(1);
    expect(repository.rows[0]).toMatchObject({
      rowStatus: "standard_rule",
      targetMaterialId: undefined,
      changeSet: expect.objectContaining({
        standardRule: expect.objectContaining({
          paperKind: "corrugating",
          grade: "A",
        }),
      }),
    });
  });
});
