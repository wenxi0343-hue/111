import { describe, expect, it } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import { buildPaperPriceSourceSignature } from "@/modules/master-data/import-preview";
import type {
  MasterDataChangeLogRecord,
  MasterDataImportBatchRecord,
  MasterDataImportRepository,
  MasterDataImportRowRecord,
  MasterDataImportRowStatus,
  PaperFactoryRecord,
  PaperMaterialRecord,
  PaperMaterialMatchRuleRecord,
  PaperMaterialPriceHistoryRecord,
  PaperQualityStandardRecord,
} from "@/modules/master-data/import-commit";
import {
  confirmMasterDataImport,
  resolveMasterDataImportRow,
} from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-pending-session-secret";
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

function addExistingMaterial(repository: InMemoryMasterDataImportRepository) {
  repository.factories.push({
    id: "factory-1",
    name: "供应商A",
    supplyTypes: [],
    isActive: true,
  });
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
  });
}

function addPriceBatch(
  repository: InMemoryMasterDataImportRepository,
  rowStatus: MasterDataImportRowStatus = "update",
) {
  repository.batches.push({
    id: "batch-price",
    sourceType: "paper_price_table",
    fileName: "纸价.xlsx",
    status: "previewed",
    summary: {
      newCount: 0,
      updateCount: rowStatus === "update" ? 1 : 0,
      pendingCount: rowStatus === "pending" ? 1 : 0,
      failedCount: 0,
      incompleteCount: 0,
    },
    createdBy: "operator",
  });
  repository.rows.push({
    id: "row-price",
    batchId: "batch-price",
    sheetName: "23-3",
    rowNumber: 2,
    rowStatus,
    rawData: {},
    normalizedData: {
      supplierShortName: "供应商A",
      paperName: "105g高强瓦楞纸",
      prices: [
        { header: "3.8纸价", effectiveDate: "03-08", priceYuanPerTon: 3230 },
        { header: "3.10纸价", effectiveDate: "03-10", priceYuanPerTon: 3300 },
      ],
    },
    targetMaterialId: rowStatus === "update" ? "paper-1" : undefined,
    candidateMaterialIds: ["paper-1"],
    changeSet: {},
    errors: rowStatus === "pending" ? [{ field: "paperMaterialId", message: "请人工确认" }] : [],
  });
}

function addQualityBatch(repository: InMemoryMasterDataImportRepository) {
  repository.batches.push({
    id: "batch-quality",
    sourceType: "quality_standard_table",
    fileName: "质量标准.xlsx",
    status: "previewed",
    summary: {
      newCount: 0,
      updateCount: 1,
      pendingCount: 0,
      failedCount: 0,
      incompleteCount: 0,
    },
    createdBy: "operator",
  });
  repository.rows.push({
    id: "row-quality",
    batchId: "batch-quality",
    sheetName: "瓦纸标准",
    rowNumber: 2,
    rowStatus: "update",
    rawData: {},
    normalizedData: {
      paperKind: "corrugating",
      grade: "A",
      gramWeightMinGsm: 100,
      gramWeightMaxGsm: 120,
      burstIndex: 2.2,
      ringCrushIndex: 7.5,
      rawLabel: "耐破指数 / 横向环压指数",
      scope: "paper_kind_standard",
    },
    targetMaterialId: "paper-1",
    candidateMaterialIds: [],
    changeSet: {},
    errors: [],
  });
}

describe("pending match and master data confirmation", () => {
  it("resolves a pending row and saves a confirmed match rule", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);
    addPriceBatch(repository, "pending");

    const result = await resolveMasterDataImportRow(
      {
        batchId: "batch-price",
        rowId: "row-price",
        paperMaterialId: "paper-1",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result).toEqual({
      ok: true,
      data: {
        rowId: "row-price",
        rowStatus: "update",
        targetMaterialId: "paper-1",
      },
    });
    expect(repository.rows[0]).toMatchObject({
      rowStatus: "update",
      targetMaterialId: "paper-1",
      errors: [],
    });
    expect(repository.matchRules[0]).toMatchObject({
      sourceType: "paper_price_table",
      sourceSignature: buildPaperPriceSourceSignature({
        supplierShortName: "供应商A",
        paperName: "105g高强瓦楞纸",
        prices: [
          { header: "3.8纸价", effectiveDate: "03-08", priceYuanPerTon: 3230 },
          { header: "3.10纸价", effectiveDate: "03-10", priceYuanPerTon: 3300 },
        ],
      }),
      paperMaterialId: "paper-1",
      confirmedBy: "operator",
    });
  });

  it("rejects resolving a row that is not pending", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);
    addPriceBatch(repository, "update");

    const result = await resolveMasterDataImportRow(
      {
        batchId: "batch-price",
        rowId: "row-price",
        paperMaterialId: "paper-1",
      },
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "只有待确认行可以处理关联",
      },
    });
    expect(repository.matchRules).toHaveLength(0);
  });

  it("rejects confirmation while the batch still has unresolved pending rows", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);
    addPriceBatch(repository, "pending");

    const result = await confirmMasterDataImport("batch-price", {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先处理待确认行后再确认入库",
      },
    });
    expect(repository.priceHistories).toHaveLength(0);
  });

  it("confirms a price batch by writing price histories, current price and change log", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);
    addPriceBatch(repository, "update");

    const result = await confirmMasterDataImport("batch-price", {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-06-30T08:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(repository.priceHistories.map((history) => history.priceYuanPerTon)).toEqual([
      3230, 3300,
    ]);
    expect(repository.materials[0]).toMatchObject({
      priceYuanPerTon: 3300,
      completenessStatus: "incomplete",
      missingFields: ["burstIndex", "ringCrushIndex"],
    });
    expect(repository.changeLogs[0]).toMatchObject({
      entityType: "paper_material",
      entityId: "paper-1",
      changeSource: "import",
      changedFields: {
        price_yuan_per_ton: { before: 3200, after: 3300 },
      },
    });
  });

  it("confirms a quality batch by saving a standard, updating strength fields and logging changes", async () => {
    const repository = new InMemoryMasterDataImportRepository();
    addExistingMaterial(repository);
    addQualityBatch(repository);

    const result = await confirmMasterDataImport("batch-quality", {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
      now: new Date("2026-06-30T08:00:00.000Z"),
    });

    expect(result.ok).toBe(true);
    expect(repository.qualityStandards[0]).toMatchObject({
      paperKind: "corrugating",
      grade: "A",
      gramWeightMinGsm: 100,
      gramWeightMaxGsm: 120,
      burstIndex: 2.2,
      ringCrushIndex: 7.5,
      sourceFileName: "质量标准.xlsx",
      sourceSheetName: "瓦纸标准",
    });
    expect(repository.materials[0]).toMatchObject({
      burstIndex: 2.2,
      ringCrushIndex: 7.5,
      completenessStatus: "complete",
      missingFields: [],
    });
    expect(repository.changeLogs[0]).toMatchObject({
      entityType: "paper_material",
      entityId: "paper-1",
      changeSource: "import",
      changedFields: {
        burst_index: { before: null, after: 2.2 },
        ring_crush_index: { before: null, after: 7.5 },
        completeness_status: { before: "incomplete", after: "complete" },
        missing_fields: { before: ["burstIndex", "ringCrushIndex"], after: [] },
      },
    });
  });
});
