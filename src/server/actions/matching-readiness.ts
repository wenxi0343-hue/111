import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { paperFactories, paperMaterials } from "@/db/schema";
import type * as schema from "@/db/schema";
import {
  createDrizzleFormulaParameterStatusRepository,
  hasActiveFormulaParametersFromRepository,
} from "@/modules/formulas/read-formula-parameter-status";
import type { ActionResult } from "@/shared/types/action-result";

type AppDatabase = NodePgDatabase<typeof schema>;

export const MATCHING_BASE_DATA_ERROR_MESSAGE =
  "配纸资料不完整，请到后端资料库补齐后再生成方案";

export interface MatchingDataMissingItem {
  scope: "paper_material" | "formula_parameter";
  code?: string | undefined;
  name?: string | undefined;
  field: string;
  message: string;
}

export interface MatchingReadiness {
  hasPaperFactories: boolean;
  hasLinerPaper: boolean;
  hasCorrugatingPaper: boolean;
  hasFormulaParameters: boolean;
  missingItems?: MatchingDataMissingItem[] | undefined;
}

export interface MatchingReadinessRepository {
  getMatchingReadiness(): Promise<MatchingReadiness>;
}

export async function checkMatchingReadinessFromRepository({
  repository,
}: {
  repository: MatchingReadinessRepository;
}): Promise<ActionResult<MatchingReadiness>> {
  const readiness = await repository.getMatchingReadiness();
  const missingItems = [
    ...(readiness.missingItems ?? []),
    ...createMissingItemsFromReadiness(readiness, readiness.missingItems ?? []),
  ];

  if (
    readiness.hasPaperFactories &&
    readiness.hasLinerPaper &&
    readiness.hasCorrugatingPaper &&
    readiness.hasFormulaParameters &&
    missingItems.length === 0
  ) {
    return {
      ok: true,
      data: readiness,
    };
  }

  return {
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: MATCHING_BASE_DATA_ERROR_MESSAGE,
      details: {
        missingItems,
        fieldErrors: [
          {
            field: "baseData",
            message: MATCHING_BASE_DATA_ERROR_MESSAGE,
          },
        ],
      },
    },
  };
}

function createMissingItemsFromReadiness(
  readiness: MatchingReadiness,
  existingMissingItems: MatchingDataMissingItem[],
): MatchingDataMissingItem[] {
  const missingItems: MatchingDataMissingItem[] = [];
  const hasSpecificPaperMissingItems = existingMissingItems.some(
    (item) => item.scope === "paper_material",
  );
  const hasSpecificFormulaMissingItems = existingMissingItems.some(
    (item) => item.scope === "formula_parameter",
  );

  if (!readiness.hasPaperFactories && !hasSpecificPaperMissingItems) {
    missingItems.push({
      scope: "paper_material",
      field: "factory",
      message: "缺少启用的纸厂或供应商资料",
    });
  }

  if (!readiness.hasLinerPaper && !hasSpecificPaperMissingItems) {
    missingItems.push({
      scope: "paper_material",
      field: "linerboard",
      message: "缺少完整且启用的箱板纸资料",
    });
  }

  if (!readiness.hasCorrugatingPaper && !hasSpecificPaperMissingItems) {
    missingItems.push({
      scope: "paper_material",
      field: "corrugating",
      message: "缺少完整且启用的瓦纸资料",
    });
  }

  if (!readiness.hasFormulaParameters && !hasSpecificFormulaMissingItems) {
    missingItems.push({
      scope: "formula_parameter",
      field: "formulaParameters",
      message: "缺少基础参数资料",
    });
  }

  return missingItems;
}

export function createDrizzleMatchingReadinessRepository(
  db: AppDatabase,
): MatchingReadinessRepository {
  return new DrizzleMatchingReadinessRepository(db);
}

class DrizzleMatchingReadinessRepository implements MatchingReadinessRepository {
  constructor(private readonly db: AppDatabase) {}

  async getMatchingReadiness(): Promise<MatchingReadiness> {
    const formulaParameterRepository = createDrizzleFormulaParameterStatusRepository(this.db);

    const [hasPaperFactories, hasLinerPaper, hasCorrugatingPaper, hasFormulaParameters] =
      await Promise.all([
        this.hasActivePaperFactory(),
        this.hasActiveCompletePaperMaterial("linerboard"),
        this.hasActiveCompletePaperMaterial("corrugating"),
        hasActiveFormulaParametersFromRepository({
          repository: formulaParameterRepository,
        }),
      ]);

    return {
      hasPaperFactories,
      hasLinerPaper,
      hasCorrugatingPaper,
      hasFormulaParameters,
    };
  }

  private async hasActivePaperFactory(): Promise<boolean> {
    const rows = await this.db
      .select({ id: paperFactories.id })
      .from(paperFactories)
      .where(eq(paperFactories.isActive, true))
      .limit(1);

    return rows.length > 0;
  }

  private async hasActiveCompletePaperMaterial(
    paperKind: "linerboard" | "corrugating",
  ): Promise<boolean> {
    const rows = await this.db
      .select({ id: paperMaterials.id })
      .from(paperMaterials)
      .where(
        and(
          eq(paperMaterials.paperKind, paperKind),
          eq(paperMaterials.completenessStatus, "complete"),
          eq(paperMaterials.isActive, true),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}
