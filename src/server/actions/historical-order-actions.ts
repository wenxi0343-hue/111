"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
import {
  parseHistoricalOrderWorkbook,
  validateHistoricalOrderImportFileName,
} from "@/modules/import-export/historical-order-workbook-parser";
import {
  cancelHistoricalOrderImport as cancelHistoricalOrderImportBatch,
  confirmHistoricalOrderImport as confirmHistoricalOrderImportBatch,
  type CancelHistoricalOrderImportResult,
  type ConfirmHistoricalOrderImportResult,
} from "@/modules/historical-orders/import-commit";
import {
  createDrizzleHistoricalOrderImportRepository,
  createHistoricalOrderImportPreview,
  saveHistoricalOrderImportPreview,
  type HistoricalOrderImportPreview,
  type HistoricalOrderImportRepository,
} from "@/modules/historical-orders/import-preview";
import {
  listHistoricalOrderHabitSummaries as listHistoricalOrderHabitSummariesFromRepository,
  type ListHistoricalOrderHabitSummariesQuery,
  type ListHistoricalOrderHabitSummariesResult,
} from "@/modules/historical-orders/list-habit-summaries";
import { requireAuthenticatedAction } from "@/server/guards/auth";
import type { ActionResult } from "@/shared/types/action-result";

interface SessionCookieReader {
  get(name: string): { value: string } | undefined;
}

interface HistoricalOrderActionOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader;
  now?: Date;
  repository?: HistoricalOrderImportRepository;
}

export interface PreviewHistoricalOrderImportResult extends HistoricalOrderImportPreview {
  batchId: string;
}

export interface ConfirmHistoricalOrderImportInput {
  batchId: string;
  sizeBucketConfig: {
    confirmed: boolean;
    smallMaxVolume: number;
    mediumMaxVolume: number;
  };
}

export async function previewHistoricalOrderImport(
  formData: FormData,
  options: HistoricalOrderActionOptions = {},
): Promise<ActionResult<PreviewHistoricalOrderImportResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return validationError("请上传历史订单文件");
  }

  const fileNameValidation = validateHistoricalOrderImportFileName(file.name);

  if (!fileNameValidation.ok) {
    return fileNameValidation;
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const parseResult = await parseHistoricalOrderWorkbook(Buffer.from(await file.arrayBuffer()));

    if (!parseResult.ok) {
      return parseResult;
    }

    const existingMaterials =
      await repositoryContext.data.repository.listPaperMaterialsForPreview();
    const preview = createHistoricalOrderImportPreview({
      rows: parseResult.data.rows,
      existingMaterials,
    });
    const savedPreview = await saveHistoricalOrderImportPreview({
      repository: repositoryContext.data.repository,
      preview,
      fileName: file.name,
      createdBy: authResult.data.username,
    });
    const savedRows = await repositoryContext.data.repository.listImportRowsByBatchId(
      savedPreview.batchId,
    );

    return {
      ok: true,
      data: {
        batchId: savedPreview.batchId,
        summary: preview.summary,
        sizeBucketPreview: preview.sizeBucketPreview,
        rows: preview.rows.map((row, index) => ({
          ...row,
          id: savedRows[index]?.id,
        })),
      },
    };
  } catch {
    return validationError("历史订单文件无法解析，请确认文件内容后重试");
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function confirmHistoricalOrderImport(
  input: ConfirmHistoricalOrderImportInput,
  options: HistoricalOrderActionOptions = {},
): Promise<ActionResult<ConfirmHistoricalOrderImportResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await confirmHistoricalOrderImportBatch({
      repository: repositoryContext.data.repository,
      batchId: input.batchId,
      sizeBucketConfig: input.sizeBucketConfig,
      confirmedBy: authResult.data.username,
      confirmedAt: options.now ?? new Date(),
    });
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function cancelHistoricalOrderImport(
  batchId: string,
  options: HistoricalOrderActionOptions = {},
): Promise<ActionResult<CancelHistoricalOrderImportResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await cancelHistoricalOrderImportBatch({
      repository: repositoryContext.data.repository,
      batchId,
    });
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function listHistoricalOrderHabitSummaries(
  query: ListHistoricalOrderHabitSummariesQuery = {},
  options: HistoricalOrderActionOptions = {},
): Promise<ActionResult<ListHistoricalOrderHabitSummariesResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await listHistoricalOrderHabitSummariesFromRepository({
      repository: repositoryContext.data.repository,
      query,
    });
  } finally {
    await repositoryContext.data.close?.();
  }
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

function buildAuthOptions(options: HistoricalOrderActionOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}

function createRepositoryContext({
  env = process.env,
  repository,
}: HistoricalOrderActionOptions): ActionResult<{
  repository: HistoricalOrderImportRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (repository) {
    return {
      ok: true,
      data: {
        repository,
      },
    };
  }

  const databaseUrlResult = getDatabaseUrl(env);

  if (!databaseUrlResult.ok) {
    return databaseUrlResult;
  }

  const client = createDatabaseClient(databaseUrlResult.data);

  return {
    ok: true,
    data: {
      repository: createDrizzleHistoricalOrderImportRepository(client.db),
      close: client.close,
    },
  };
}
