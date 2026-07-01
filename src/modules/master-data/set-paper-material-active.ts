import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { masterDataChangeLogs, paperMaterials } from "@/db/schema";
import type * as schema from "@/db/schema";
import type { MasterDataChangeLogRecord } from "@/modules/master-data/import-commit";
import type { ActionResult } from "@/shared/types/action-result";

type AppDatabase = NodePgDatabase<typeof schema>;

export interface PaperMaterialActiveRecord {
  id: string;
  isActive: boolean;
}

export interface SetPaperMaterialActiveInput {
  paperMaterialId: string;
  isActive: boolean;
  reason?: string | undefined;
}

export interface SetPaperMaterialActiveResult {
  paperMaterialId: string;
  isActive: boolean;
  changedFields: MasterDataChangeLogRecord["changedFields"];
}

export interface SetPaperMaterialActiveRepository {
  transaction<T>(run: (repository: SetPaperMaterialActiveRepository) => Promise<T>): Promise<T>;
  findPaperMaterialById(id: string): Promise<PaperMaterialActiveRecord | undefined>;
  updatePaperMaterialActive(id: string, isActive: boolean): Promise<PaperMaterialActiveRecord>;
  createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void>;
}

export async function setPaperMaterialActiveFromRepository({
  repository,
  input,
  changedBy,
  now = new Date(),
}: {
  repository: SetPaperMaterialActiveRepository;
  input: SetPaperMaterialActiveInput;
  changedBy: string;
  now?: Date | undefined;
}): Promise<ActionResult<SetPaperMaterialActiveResult>> {
  if (!input.paperMaterialId.trim()) {
    return validationError("原纸资料不能为空");
  }

  const reason = input.reason?.trim();

  if (!reason) {
    return validationError("启用或停用原纸时需要填写原因");
  }

  return repository.transaction(async (transactionRepository) => {
    const currentMaterial = await transactionRepository.findPaperMaterialById(input.paperMaterialId);

    if (!currentMaterial) {
      return validationError("原纸资料不存在");
    }

    const changedFields: MasterDataChangeLogRecord["changedFields"] = {};

    if (currentMaterial.isActive !== input.isActive) {
      changedFields.is_active = {
        before: currentMaterial.isActive,
        after: input.isActive,
      };

      await transactionRepository.updatePaperMaterialActive(
        currentMaterial.id,
        input.isActive,
      );

      await transactionRepository.createChangeLog({
        entityType: "paper_material",
        entityId: currentMaterial.id,
        changeSource: "manual",
        changedFields,
        reason,
        changedBy,
        createdAt: now,
      });
    }

    return {
      ok: true,
      data: {
        paperMaterialId: currentMaterial.id,
        isActive: input.isActive,
        changedFields,
      },
    };
  });
}

export function createDrizzleSetPaperMaterialActiveRepository(
  db: AppDatabase,
): SetPaperMaterialActiveRepository {
  return new DrizzleSetPaperMaterialActiveRepository(db);
}

function validationError(message: string): ActionResult<never> {
  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  };
}

class DrizzleSetPaperMaterialActiveRepository implements SetPaperMaterialActiveRepository {
  constructor(private readonly db: AppDatabase) {}

  async transaction<T>(
    run: (repository: SetPaperMaterialActiveRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) => run(new DrizzleSetPaperMaterialActiveRepository(tx)));
  }

  async findPaperMaterialById(id: string): Promise<PaperMaterialActiveRecord | undefined> {
    const [material] = await this.db
      .select({
        id: paperMaterials.id,
        isActive: paperMaterials.isActive,
      })
      .from(paperMaterials)
      .where(eq(paperMaterials.id, id))
      .limit(1);

    return material;
  }

  async updatePaperMaterialActive(
    id: string,
    isActive: boolean,
  ): Promise<PaperMaterialActiveRecord> {
    const [material] = await this.db
      .update(paperMaterials)
      .set({
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(paperMaterials.id, id))
      .returning({
        id: paperMaterials.id,
        isActive: paperMaterials.isActive,
      });

    if (!material) {
      throw new Error("paper material not found");
    }

    return material;
  }

  async createChangeLog(input: Omit<MasterDataChangeLogRecord, "id">): Promise<void> {
    await this.db.insert(masterDataChangeLogs).values({
      entityType: input.entityType,
      entityId: input.entityId,
      changeSource: input.changeSource,
      importBatchId: input.importBatchId,
      changedFields: input.changedFields,
      reason: input.reason,
      changedBy: input.changedBy,
      createdAt: input.createdAt,
    });
  }
}
