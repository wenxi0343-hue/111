"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
import { parsePaperCodeWorkbook } from "@/modules/import-export/master-data-workbook-parser";
import {
  confirmPaperCodeImportBatch,
  createDrizzleMasterDataImportRepository,
  savePaperCodeImportPreview,
  type ConfirmPaperCodeImportBatchResult,
  type MasterDataImportRepository,
} from "@/modules/master-data/import-commit";
import {
  getMasterDataChangeHistoryFromRepository,
  type GetMasterDataChangeHistoryInput,
  type GetMasterDataChangeHistoryResult,
} from "@/modules/master-data/change-log";
import { createPaperCodeImportPreview } from "@/modules/master-data/import-preview";
import { requireAuthenticatedAction } from "@/server/guards/auth";
import type { ActionResult } from "@/shared/types/action-result";

interface SessionCookieReader {
  get(name: string): { value: string } | undefined;
}

interface MasterDataActionOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader;
  now?: Date;
  repository?: MasterDataImportRepository;
}

export interface PreviewMasterDataImportResult {
  batchId: string;
  summary: {
    newCount: number;
    updateCount: number;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  };
  rows: ReturnType<typeof createPaperCodeImportPreview>["rows"];
}

const PAPER_CODE_SOURCE_TYPE = "paper_code_table";

export async function previewMasterDataImport(
  formData: FormData,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<PreviewMasterDataImportResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const sourceType = formData.get("sourceType");
  const file = formData.get("file");

  if (sourceType !== PAPER_CODE_SOURCE_TYPE) {
    return validationError("当前阶段仅支持原纸代码表导入");
  }

  if (!(file instanceof File)) {
    return validationError("请上传原纸代码表文件");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return validationError("原纸代码表导入仅支持 .xlsx 文件");
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const workbookBuffer = Buffer.from(await file.arrayBuffer());
    const parseResult = await parsePaperCodeWorkbook(workbookBuffer);

    if (!parseResult.ok) {
      return parseResult;
    }

    const existingMaterials =
      await repositoryContext.data.repository.listPaperMaterialsForPreview();
    const preview = createPaperCodeImportPreview({
      rows: parseResult.data.rows,
      existingMaterials,
    });
    const savedPreview = await savePaperCodeImportPreview({
      repository: repositoryContext.data.repository,
      preview,
      sourceType: PAPER_CODE_SOURCE_TYPE,
      fileName: file.name,
      createdBy: authResult.data.username,
    });

    return {
      ok: true,
      data: {
        batchId: savedPreview.batchId,
        summary: preview.summary,
        rows: preview.rows,
      },
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function confirmMasterDataImport(
  batchId: string,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<ConfirmPaperCodeImportBatchResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  if (!batchId.trim()) {
    return validationError("导入批次不能为空");
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await confirmPaperCodeImportBatch({
      repository: repositoryContext.data.repository,
      batchId,
      confirmedBy: authResult.data.username,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function getMasterDataChangeHistory(
  input: GetMasterDataChangeHistoryInput,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<GetMasterDataChangeHistoryResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return {
      ok: true,
      data: await getMasterDataChangeHistoryFromRepository({
        repository: repositoryContext.data.repository,
        input,
      }),
    };
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

function buildAuthOptions(options: MasterDataActionOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}

function createRepositoryContext({
  env = process.env,
  repository,
}: MasterDataActionOptions): ActionResult<{
  repository: MasterDataImportRepository;
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
      repository: createDrizzleMasterDataImportRepository(client.db),
      close: client.close,
    },
  };
}
