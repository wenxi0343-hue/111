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

export const MATCHING_BASE_DATA_ERROR_MESSAGE = "请先维护纸厂、箱板纸、瓦纸和基础参数";

export interface MatchingReadiness {
  hasPaperFactories: boolean;
  hasLinerPaper: boolean;
  hasCorrugatingPaper: boolean;
  hasFormulaParameters: boolean;
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

  if (
    readiness.hasPaperFactories &&
    readiness.hasLinerPaper &&
    readiness.hasCorrugatingPaper &&
    readiness.hasFormulaParameters
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
