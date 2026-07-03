import type {
  HistoricalOrderHabitDimensionType,
  HistoricalOrderHabitSummaryInsert,
} from "@/modules/historical-orders/habit-summary";
import type { HistoricalOrderImportRepository } from "@/modules/historical-orders/import-preview";
import type { ActionResult } from "@/shared/types/action-result";

export interface HistoricalOrderHabitSummaryItem extends HistoricalOrderHabitSummaryInsert {
  id?: string | undefined;
  generatedAt?: Date | undefined;
}

export interface ListHistoricalOrderHabitSummariesQuery {
  dimensionType?: HistoricalOrderHabitDimensionType | undefined;
  dimensionKey?: string | undefined;
  limit?: number | undefined;
}

export interface ListHistoricalOrderHabitSummariesResult {
  items: HistoricalOrderHabitSummaryItem[];
}

export async function listHistoricalOrderHabitSummaries(input: {
  repository: HistoricalOrderImportRepository;
  query?: ListHistoricalOrderHabitSummariesQuery | undefined;
}): Promise<ActionResult<ListHistoricalOrderHabitSummariesResult>> {
  try {
    const items = await input.repository.listHistoricalOrderHabitSummaries({
      ...input.query,
      limit: clampLimit(input.query?.limit),
    });

    return {
      ok: true,
      data: {
        items,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "DATA_READ_FAILED",
        message: "历史配纸习惯摘要暂时无法读取",
      },
    };
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 30;
  }

  if (!Number.isFinite(limit)) {
    return 30;
  }

  return Math.min(100, Math.max(1, Math.trunc(limit)));
}
