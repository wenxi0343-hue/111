"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
import {
  parsePaperCodeCsv,
  parsePaperCodeWorkbook,
  parsePaperPriceWorkbook,
  parseQualityStandardWorkbook,
} from "@/modules/import-export/master-data-workbook-parser";
import {
  confirmMasterDataImportBatch,
  createDrizzleMasterDataImportRepository,
  resolveMasterDataImportRowInRepository,
  saveMasterDataImportPreview,
  type ConfirmPaperCodeImportBatchResult,
  type MasterDataImportRepository,
  type MasterDataImportSourceType,
  type ResolveMasterDataImportRowResult,
} from "@/modules/master-data/import-commit";
import {
  createDrizzleMasterDataChangeLogRepository,
  getMasterDataChangeHistoryFromRepository,
  type GetMasterDataChangeHistoryInput,
  type GetMasterDataChangeHistoryResult,
  type MasterDataChangeLogRepository,
} from "@/modules/master-data/change-log";
import {
  createPaperCodeImportPreview,
  createPaperPriceImportPreview,
  createQualityStandardImportPreview,
  type PaperCodeImportPreview,
  type PaperPriceImportPreview,
  type QualityStandardImportPreview,
} from "@/modules/master-data/import-preview";
import {
  createDrizzleListPaperMaterialsRepository,
  listPaperMaterialsFromRepository,
  type ListPaperMaterialsQuery,
  type ListPaperMaterialsRepository,
  type ListPaperMaterialsResult,
} from "@/modules/master-data/list-paper-materials";
import {
  createDrizzleSetPaperMaterialActiveRepository,
  setPaperMaterialActiveFromRepository,
  type SetPaperMaterialActiveInput,
  type SetPaperMaterialActiveRepository,
  type SetPaperMaterialActiveResult,
} from "@/modules/master-data/set-paper-material-active";
import {
  createDrizzleUpdatePaperMaterialRepository,
  updatePaperMaterialFromRepository,
  type UpdatePaperMaterialInput,
  type UpdatePaperMaterialRepository,
  type UpdatePaperMaterialResult,
} from "@/modules/master-data/update-paper-material";
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
  paperMaterialListRepository?: ListPaperMaterialsRepository;
  updatePaperMaterialRepository?: UpdatePaperMaterialRepository;
  setPaperMaterialActiveRepository?: SetPaperMaterialActiveRepository;
  changeLogRepository?: MasterDataChangeLogRepository;
}

export interface PreviewMasterDataImportResult {
  batchId: string;
  sourceType: MasterDataImportSourceType;
  summary: {
    newCount: number;
    updateCount: number;
    pendingCount: number;
    failedCount: number;
    incompleteCount: number;
  };
  rows: PreviewMasterDataImportRow[];
}

export type MasterDataImportPreview =
  | PaperCodeImportPreview
  | PaperPriceImportPreview
  | QualityStandardImportPreview;

export type PreviewMasterDataImportRow =
  (
    | PaperCodeImportPreview["rows"][number]
    | PaperPriceImportPreview["rows"][number]
    | QualityStandardImportPreview["rows"][number]
  ) & { id?: string | undefined };

const MASTER_DATA_IMPORT_SOURCE_TYPES = [
  "paper_code_table",
  "paper_price_table",
  "quality_standard_table",
] as const satisfies readonly MasterDataImportSourceType[];

export interface ResolveMasterDataImportRowActionInput {
  batchId: string;
  rowId: string;
  paperMaterialId: string;
}

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

  if (!isMasterDataImportSourceType(sourceType)) {
    return validationError("当前阶段仅支持原纸代码表导入");
  }

  if (!(file instanceof File)) {
    return validationError("请上传原纸代码表文件");
  }

  if (!isSupportedMasterDataImportFile(file.name)) {
    return validationError("本功能只支持 .xlsx 和 .csv 文件");
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const existingMaterials =
      await repositoryContext.data.repository.listPaperMaterialsForPreview();
    const previewResult = await createMasterDataImportPreview({
      file,
      sourceType,
      existingMaterials,
    });

    if (!previewResult.ok) {
      return previewResult;
    }

    const preview = previewResult.data;
    const savedPreview = await saveMasterDataImportPreview({
      repository: repositoryContext.data.repository,
      preview,
      sourceType,
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
        sourceType,
        summary: preview.summary,
        rows: preview.rows.map((row, index) => ({
          ...row,
          id: savedRows[index]?.id,
        })),
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
    return await confirmMasterDataImportBatch({
      repository: repositoryContext.data.repository,
      batchId,
      confirmedBy: authResult.data.username,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function resolveMasterDataImportRow(
  input: ResolveMasterDataImportRowActionInput,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<ResolveMasterDataImportRowResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  if (!input.batchId.trim() || !input.rowId.trim() || !input.paperMaterialId.trim()) {
    return validationError("待确认行和目标原纸不能为空");
  }

  const repositoryContext = createRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await resolveMasterDataImportRowInRepository({
      repository: repositoryContext.data.repository,
      batchId: input.batchId,
      rowId: input.rowId,
      paperMaterialId: input.paperMaterialId,
      confirmedBy: authResult.data.username,
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

  const repositoryContext = createChangeLogRepositoryContext(options);

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

export async function listPaperMaterials(
  query: ListPaperMaterialsQuery = {},
  options: MasterDataActionOptions = {},
): Promise<ActionResult<ListPaperMaterialsResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createPaperMaterialListRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return {
      ok: true,
      data: await listPaperMaterialsFromRepository({
        repository: repositoryContext.data.repository,
        query,
      }),
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function updatePaperMaterial(
  input: UpdatePaperMaterialInput,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<UpdatePaperMaterialResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createUpdatePaperMaterialRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await updatePaperMaterialFromRepository({
      repository: repositoryContext.data.repository,
      input,
      updatedBy: authResult.data.username,
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function setPaperMaterialActive(
  input: SetPaperMaterialActiveInput,
  options: MasterDataActionOptions = {},
): Promise<ActionResult<SetPaperMaterialActiveResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  const repositoryContext = createSetPaperMaterialActiveRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    return await setPaperMaterialActiveFromRepository({
      repository: repositoryContext.data.repository,
      input,
      changedBy: authResult.data.username,
      ...(options.now !== undefined ? { now: options.now } : {}),
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

function buildAuthOptions(options: MasterDataActionOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}

function isSupportedMasterDataImportFile(fileName: string): boolean {
  const lowerFileName = fileName.toLowerCase();

  return lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".csv");
}

function isMasterDataImportSourceType(
  value: FormDataEntryValue | null,
): value is MasterDataImportSourceType {
  return (
    typeof value === "string" &&
    MASTER_DATA_IMPORT_SOURCE_TYPES.includes(value as MasterDataImportSourceType)
  );
}

async function createMasterDataImportPreview(input: {
  file: File;
  sourceType: MasterDataImportSourceType;
  existingMaterials: Awaited<
    ReturnType<MasterDataImportRepository["listPaperMaterialsForPreview"]>
  >;
}): Promise<ActionResult<MasterDataImportPreview>> {
  if (input.sourceType !== "paper_code_table" && input.file.name.toLowerCase().endsWith(".csv")) {
    return validationError("绾镐环琛ㄥ拰璐ㄩ噺鏍囧噯琛ㄦ殏浠呮敮鎸?.xlsx 鏂囦欢");
  }

  if (input.sourceType === "paper_code_table") {
    const parseResult = await parsePaperCodeImportFile(input.file);

    if (!parseResult.ok) {
      return parseResult;
    }

    return {
      ok: true,
      data: createPaperCodeImportPreview({
        rows: parseResult.data.rows,
        existingMaterials: input.existingMaterials,
      }),
    };
  }

  if (input.sourceType === "paper_price_table") {
    const parseResult = await parsePaperPriceWorkbook(
      Buffer.from(await input.file.arrayBuffer()),
    );

    if (!parseResult.ok) {
      return parseResult;
    }

    return {
      ok: true,
      data: createPaperPriceImportPreview({
        rows: parseResult.data.rows,
        existingMaterials: input.existingMaterials,
        confirmedMatchRules: [],
      }),
    };
  }

  const parseResult = await parseQualityStandardWorkbook(
    Buffer.from(await input.file.arrayBuffer()),
  );

  if (!parseResult.ok) {
    return parseResult;
  }

  return {
    ok: true,
    data: createQualityStandardImportPreview({
      rows: parseResult.data.rows,
      existingMaterials: input.existingMaterials,
    }),
  };
}

async function parsePaperCodeImportFile(file: File) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parsePaperCodeCsv(await file.text());
  }

  return parsePaperCodeWorkbook(Buffer.from(await file.arrayBuffer()));
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

function createPaperMaterialListRepositoryContext({
  env = process.env,
  paperMaterialListRepository,
}: MasterDataActionOptions): ActionResult<{
  repository: ListPaperMaterialsRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (paperMaterialListRepository) {
    return {
      ok: true,
      data: {
        repository: paperMaterialListRepository,
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
      repository: createDrizzleListPaperMaterialsRepository(client.db),
      close: client.close,
    },
  };
}

function createUpdatePaperMaterialRepositoryContext({
  env = process.env,
  updatePaperMaterialRepository,
}: MasterDataActionOptions): ActionResult<{
  repository: UpdatePaperMaterialRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (updatePaperMaterialRepository) {
    return {
      ok: true,
      data: {
        repository: updatePaperMaterialRepository,
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
      repository: createDrizzleUpdatePaperMaterialRepository(client.db),
      close: client.close,
    },
  };
}

function createSetPaperMaterialActiveRepositoryContext({
  env = process.env,
  setPaperMaterialActiveRepository,
}: MasterDataActionOptions): ActionResult<{
  repository: SetPaperMaterialActiveRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (setPaperMaterialActiveRepository) {
    return {
      ok: true,
      data: {
        repository: setPaperMaterialActiveRepository,
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
      repository: createDrizzleSetPaperMaterialActiveRepository(client.db),
      close: client.close,
    },
  };
}

function createChangeLogRepositoryContext({
  env = process.env,
  repository,
  changeLogRepository,
}: MasterDataActionOptions): ActionResult<{
  repository: MasterDataChangeLogRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (changeLogRepository) {
    return {
      ok: true,
      data: {
        repository: changeLogRepository,
      },
    };
  }

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
      repository: createDrizzleMasterDataChangeLogRepository(client.db),
      close: client.close,
    },
  };
}
