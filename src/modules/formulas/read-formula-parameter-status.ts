import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { systemMetadata } from "@/db/schema";
import type * as schema from "@/db/schema";

type AppDatabase = NodePgDatabase<typeof schema>;

export const FORMULA_PARAMETERS_READY_METADATA_KEY = "formula_parameters_ready";
export const FORMULA_PARAMETERS_READY_METADATA_VALUE = "active";

export interface FormulaParameterStatusRepository {
  hasActiveFormulaParameters(): Promise<boolean>;
}

export async function hasActiveFormulaParametersFromRepository({
  repository,
}: {
  repository: FormulaParameterStatusRepository;
}): Promise<boolean> {
  return repository.hasActiveFormulaParameters();
}

export function createDrizzleFormulaParameterStatusRepository(
  db: AppDatabase,
): FormulaParameterStatusRepository {
  return new DrizzleFormulaParameterStatusRepository(db);
}

class DrizzleFormulaParameterStatusRepository implements FormulaParameterStatusRepository {
  constructor(private readonly db: AppDatabase) {}

  async hasActiveFormulaParameters(): Promise<boolean> {
    const rows = await this.db
      .select({ id: systemMetadata.id })
      .from(systemMetadata)
      .where(
        and(
          eq(systemMetadata.key, FORMULA_PARAMETERS_READY_METADATA_KEY),
          eq(systemMetadata.value, FORMULA_PARAMETERS_READY_METADATA_VALUE),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }
}
