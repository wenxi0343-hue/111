"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
import {
  attachSelectionReasonsToSlots,
  createSelectionReason,
  type AiReasoningOptions,
  type AiReasoningProvider,
  type CreateSelectionReasonInput,
} from "@/modules/ai-reasoning/generate-selection-reason";
import type { AiReasoningRepository } from "@/modules/ai-reasoning/cache";
import { createDrizzleAiReasoningRepository } from "@/modules/ai-reasoning/drizzle-repository";
import { extractSelectionReasonFactsFromEvaluation } from "@/modules/ai-reasoning/extract-reason-facts";
import { createConfiguredAiReasoningProvider } from "@/modules/ai-reasoning/openai-provider";
import type { SelectionReason } from "@/modules/ai-reasoning/types";
import type { BoxSpecInput, NormalizedBoxSpec } from "@/modules/box-spec/types";
import { isStackingRequired, validateBoxSpecInput } from "@/modules/box-spec/validate-box-spec";
import { DEFAULT_CALCULATION_PARAMETERS } from "@/modules/calculations/default-parameters";
import { evaluateCandidate } from "@/modules/calculations/evaluate-candidate";
import { evaluateMatchingCandidates } from "@/modules/calculations/evaluate-matching-candidates";
import type {
  CandidateEvaluation,
  EvaluateCandidateInput,
  EvaluateMatchingCandidatesResult,
  MatchingCandidate,
  RejectedCandidateEvaluation,
  RejectedCandidateSummary,
} from "@/modules/calculations/types";
import {
  listRecommendablePaperMaterialsFromRepository,
  type ListRecommendablePaperMaterialsRepository,
  type RecommendablePaperMaterial,
} from "@/modules/master-data/list-recommendable-paper-materials";
import {
  MatchingSourcePaperMaterialRepository,
  MatchingSourceReadinessRepository,
} from "@/modules/master-data/matching-source";
import { WarehouseDatabaseMatchingSourceDataRepository } from "@/modules/master-data/warehouse-database-matching-source";
import { createDefaultMatchingCandidates } from "@/modules/recommendation/create-default-matching-candidates";
import { filterCandidatesByApplicableLayerCount } from "@/modules/recommendation/layer-applicability";
import { selectMatchingRecommendations } from "@/modules/recommendation/select-matching-recommendations";
import type {
  RecommendationSlot,
  RecommendationStrategy,
  SelectMatchingRecommendationsResult,
} from "@/modules/recommendation/types";
import {
  createGenerationToken,
  resolveGenerationTokenSecret,
  verifyGenerationToken,
} from "@/modules/recommendation/generation-token";
import { createHistorySnapshot } from "@/modules/scheme-adjustment/create-history-snapshot";
import type {
  MatchingSchemeFinalStatus,
  MatchingSchemeHistorySnapshot,
} from "@/modules/scheme-adjustment/types";
import {
  checkMatchingReadinessFromRepository,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import {
  createDrizzleMatchingSchemeHistoryRepository,
  saveMatchingSchemeHistory,
  type MatchingSchemeHistoryRecordInput,
  type MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";
import { readAuthenticatedUser } from "@/server/guards/auth";
import type { ActionResult } from "@/shared/types/action-result";

interface SessionCookieReader {
  get(name: string): { value: string } | undefined;
}

interface MatchingActionOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader;
  now?: Date;
  readinessRepository?: MatchingReadinessRepository;
  paperMaterialRepository?: ListRecommendablePaperMaterialsRepository;
  createCandidates?: ((materials: RecommendablePaperMaterial[]) => MatchingCandidate[]) | undefined;
  evaluateMatchingCandidatesFn?:
    | ((input: {
        boxSpec: NormalizedBoxSpec;
        candidates: MatchingCandidate[];
      }) => EvaluateMatchingCandidatesResult)
    | undefined;
  selectMatchingRecommendationsFn?:
    | ((input: {
        evaluation: EvaluateMatchingCandidatesResult;
        parameters: typeof DEFAULT_CALCULATION_PARAMETERS;
        boxSpec?: NormalizedBoxSpec | undefined;
      }) => SelectMatchingRecommendationsResult)
    | undefined;
  aiReasoningProvider?: AiReasoningProvider | undefined;
  aiReasoningRepository?: AiReasoningRepository | undefined;
  aiReasoningOptions?: Partial<AiReasoningOptions> | undefined;
  createSelectionReasonFn?:
    ((input: CreateSelectionReasonInput) => Promise<SelectionReason>) | undefined;
  historyRepository?: MatchingSchemeHistoryRepository | undefined;
  evaluateCandidateFn?: ((input: EvaluateCandidateInput) => CandidateEvaluation) | undefined;
}

const MATCHING_SCHEME_NOT_SAVEABLE_MESSAGE = "当前方案未达标或不可生产，无法确认保存";
const DATABASE_CONNECTION_FAILED_MESSAGE = "数据库连接不可用，请检查地址、账号、密码或网络。";
const RETURNED_REJECTED_CANDIDATE_LIMIT = 20;

export type GenerateMatchingSchemeInput = BoxSpecInput;

export interface SaveConfirmedMatchingSchemeInput {
  boxSpec: BoxSpecInput;
  originalRecommendationSlots: RecommendationSlot[];
  selectedStrategy?: RecommendationStrategy | undefined;
  generationToken?: string | undefined;
}

export interface GenerateMatchingSchemeResult {
  boxSpec: NormalizedBoxSpec;
  stackingIncluded: boolean;
  stackingDisplayText: string;
  recommendationSlots: RecommendationSlot[];
  recommendationMessages: string[];
  rejectedSummary: RejectedCandidateSummary[];
  rejectedCandidates: RejectedCandidateEvaluation[];
  generationToken: string;
}

export interface SaveConfirmedMatchingSchemeResult {
  schemeId: string;
  finalStatus: MatchingSchemeHistorySnapshot["finalStatus"];
  isManuallyAdjusted: boolean;
  warningMessages: string[];
  savedAt: string;
}

export async function generateMatchingScheme(
  input: GenerateMatchingSchemeInput,
  options: MatchingActionOptions = {},
): Promise<ActionResult<GenerateMatchingSchemeResult>> {
  const validationResult = validateBoxSpecInput(input);

  if (!validationResult.ok) {
    return {
      ok: false,
      error: {
        code: validationResult.error.code,
        message: validationResult.error.message,
        details: {
          fieldErrors: validationResult.error.fieldErrors,
        },
      },
    };
  }

  const repositoryContext = createMatchingRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    let paperMaterials: Awaited<
      ReturnType<typeof listRecommendablePaperMaterialsFromRepository>
    >;

    try {
      const readinessResult = await checkMatchingReadinessFromRepository({
        repository: repositoryContext.data.repository,
      });

      if (!readinessResult.ok) {
        return readinessResult;
      }

      paperMaterials = await listRecommendablePaperMaterialsFromRepository({
        repository: repositoryContext.data.paperMaterialRepository,
      });
    } catch {
      return {
        ok: false,
        error: {
          code: "DATABASE_CONNECTION_FAILED",
          message: DATABASE_CONNECTION_FAILED_MESSAGE,
        },
      };
    }

    const rawDefaultCandidates = (options.createCandidates ?? createDefaultMatchingCandidates)(
      paperMaterials.items,
    );
    const defaultCandidates = filterCandidatesByApplicableLayerCount({
      boxSpec: validationResult.data,
      candidates: rawDefaultCandidates,
    });
    const evaluation = (options.evaluateMatchingCandidatesFn ?? evaluateMatchingCandidates)({
      boxSpec: validationResult.data,
      candidates: defaultCandidates,
    });
    const recommendationResult = (
      options.selectMatchingRecommendationsFn ?? selectMatchingRecommendations
    )({
      evaluation,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
      boxSpec: validationResult.data,
    });
    const aiReasoningContext = createAiReasoningContext({
      options,
      repository: repositoryContext.data.aiReasoningRepository,
    });
    const recommendationSlotsWithReasons = await attachSelectionReasonsToSlots({
      slots: recommendationResult.slots,
      provider: aiReasoningContext.provider,
      repository: aiReasoningContext.repository,
      options: aiReasoningContext.options,
      now: options.now,
      createSelectionReasonFn: options.createSelectionReasonFn,
    });
    const generationToken = createGenerationToken({
      boxSpec: validationResult.data,
      slots: recommendationSlotsWithReasons,
      secret: resolveGenerationTokenSecret(options.env),
    });

    return {
      ok: true,
      data: {
        boxSpec: validationResult.data,
        stackingIncluded: isStackingRequired(validationResult.data),
        stackingDisplayText: validationResult.data.stackingRequirement.displayText,
        recommendationSlots: recommendationSlotsWithReasons,
        recommendationMessages: recommendationResult.globalMessages,
        rejectedSummary: recommendationResult.rejectedSummary,
        rejectedCandidates: limitRejectedCandidatesForClient(
          recommendationResult.rejectedCandidates,
        ),
        generationToken,
      },
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function saveConfirmedMatchingScheme(
  input: SaveConfirmedMatchingSchemeInput,
  options: MatchingActionOptions = {},
): Promise<ActionResult<SaveConfirmedMatchingSchemeResult>> {
  const validationResult = validateBoxSpecInput(input.boxSpec);

  if (!validationResult.ok) {
    return {
      ok: false,
      error: {
        code: validationResult.error.code,
        message: validationResult.error.message,
        details: {
          fieldErrors: validationResult.error.fieldErrors,
        },
      },
    };
  }

  const finalCandidateResult = await resolveFinalCandidateForSave(input, options);

  if (!finalCandidateResult.ok) {
    return finalCandidateResult;
  }

  const finalEvaluation = (options.evaluateCandidateFn ?? evaluateCandidate)({
    boxSpec: validationResult.data,
    candidate: finalCandidateResult.data.candidate,
    parameters: DEFAULT_CALCULATION_PARAMETERS,
  });
  const finalStatus = resolveFinalStatus(finalEvaluation);

  if (finalStatus !== "qualified") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: MATCHING_SCHEME_NOT_SAVEABLE_MESSAGE,
      },
    };
  }

  const savedAt = options.now ?? new Date();
  const warningMessages = createWarningMessages(finalStatus);
  const selectionReason = await resolveFinalSelectionReasonForSave({
    input,
    finalEvaluation,
    isManuallyAdjusted: finalCandidateResult.data.isManuallyAdjusted,
    warningMessages,
    options,
  });
  const snapshotResult = createHistorySnapshot({
    boxSpec: validationResult.data,
    originalRecommendationSlots: input.originalRecommendationSlots,
    selectedStrategy: input.selectedStrategy,
    finalEvaluation,
    selectionReason,
    parameters: DEFAULT_CALCULATION_PARAMETERS,
    isManuallyAdjusted: finalCandidateResult.data.isManuallyAdjusted,
    savedAt,
  });

  if (!snapshotResult.ok) {
    return snapshotResult;
  }

  const repositoryContext = createHistoryRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const confirmedBy = await resolveConfirmedBy(options);
    const saveResult = await saveMatchingSchemeHistory({
      repository: repositoryContext.data.repository,
      input: toHistoryRecordInput({
        snapshot: snapshotResult.data,
        confirmedBy,
      }),
    });

    if (!saveResult.ok) {
      return saveResult;
    }

    return {
      ok: true,
      data: {
        schemeId: saveResult.data.id,
        finalStatus: snapshotResult.data.finalStatus,
        isManuallyAdjusted: snapshotResult.data.isManuallyAdjusted,
        warningMessages: snapshotResult.data.warningMessages,
        savedAt: snapshotResult.data.savedAt.toISOString(),
      },
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

async function resolveFinalSelectionReasonForSave(input: {
  input: SaveConfirmedMatchingSchemeInput;
  finalEvaluation: CandidateEvaluation;
  isManuallyAdjusted: boolean;
  warningMessages: string[];
  options: MatchingActionOptions;
}): Promise<SelectionReason> {
  const selectedSlot = input.input.selectedStrategy
    ? input.input.originalRecommendationSlots.find(
        (slot) => slot.strategy === input.input.selectedStrategy,
      )
    : undefined;

  if (selectedSlot?.selectionReason) {
    return selectedSlot.selectionReason;
  }

  const strategy = input.input.selectedStrategy ?? "balanced";
  const aiReasoningContext = createAiReasoningContext({
    options: input.options,
  });

  return await (input.options.createSelectionReasonFn ?? createSelectionReason)({
    facts: extractSelectionReasonFactsFromEvaluation({
      evaluation: input.finalEvaluation,
      strategy,
      isOfficialRecommendation: true,
      statusMessages: input.warningMessages,
    }),
    provider: aiReasoningContext.provider,
    repository: aiReasoningContext.repository,
    options: aiReasoningContext.options,
    now: input.options.now,
  });
}

async function resolveFinalCandidateForSave(
  input: SaveConfirmedMatchingSchemeInput,
  options: MatchingActionOptions,
): Promise<ActionResult<{ candidate: MatchingCandidate; isManuallyAdjusted: boolean }>> {
  if (!input.selectedStrategy) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请选择一套方案",
      },
    };
  }

  const selectedSlot = input.originalRecommendationSlots.find(
    (slot) => slot.strategy === input.selectedStrategy,
  );

  if (!selectedSlot?.evaluation) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请选择一套方案",
      },
    };
  }

  if (!selectedSlot.isOfficialRecommendation || selectedSlot.status === "reference") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "只能保存系统生成的推荐方案",
      },
    };
  }

  const validationResult = validateBoxSpecInput(input.boxSpec);
  if (!validationResult.ok) {
    return {
      ok: false,
      error: {
        code: validationResult.error.code,
        message: validationResult.error.message,
      },
    };
  }

  const tokenResult = verifyGenerationToken({
    boxSpec: validationResult.data,
    slots: input.originalRecommendationSlots,
    selectedStrategy: input.selectedStrategy,
    token: input.generationToken ?? "",
    secret: resolveGenerationTokenSecret(options.env),
  });

  if (!tokenResult.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: tokenResult.message,
      },
    };
  }

  return {
    ok: true,
    data: {
      candidate: selectedSlot.evaluation.candidate,
      isManuallyAdjusted: false,
    },
  };
}

function createHistoryRepositoryContext({
  env = process.env,
  historyRepository,
  aiReasoningRepository,
}: MatchingActionOptions): ActionResult<{
  repository: MatchingSchemeHistoryRepository;
  aiReasoningRepository?: AiReasoningRepository | undefined;
  close?: (() => Promise<void>) | undefined;
}> {
  if (historyRepository) {
    return {
      ok: true,
      data: {
        repository: historyRepository,
        aiReasoningRepository,
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
      repository: createDrizzleMatchingSchemeHistoryRepository(client.db),
      aiReasoningRepository: aiReasoningRepository ?? createDrizzleAiReasoningRepository(client.db),
      close: client.close,
    },
  };
}

function createMatchingRepositoryContext({
  env = process.env,
  paperMaterialRepository,
  readinessRepository,
  aiReasoningRepository,
}: MatchingActionOptions): ActionResult<{
  repository: MatchingReadinessRepository;
  paperMaterialRepository: ListRecommendablePaperMaterialsRepository;
  aiReasoningRepository?: AiReasoningRepository | undefined;
  close?: (() => Promise<void>) | undefined;
}> {
  if (readinessRepository && paperMaterialRepository) {
    return {
      ok: true,
      data: {
        repository: readinessRepository,
        paperMaterialRepository,
        aiReasoningRepository,
      },
    };
  }

  if (readinessRepository) {
    return {
      ok: true,
      data: {
        repository: readinessRepository,
        paperMaterialRepository: {
          async listRecommendablePaperMaterials() {
            return [];
          },
        },
        aiReasoningRepository,
      },
    };
  }

  const databaseUrlResult = getDatabaseUrl(env);

  if (!databaseUrlResult.ok) {
    return databaseUrlResult;
  }

  const client = createDatabaseClient(databaseUrlResult.data);
  const sourceRepository = new WarehouseDatabaseMatchingSourceDataRepository({
    async query(text, values) {
      const result = await client.pool.query(text, values);
      return { rows: result.rows };
    },
  });

  return {
    ok: true,
    data: {
      repository: new MatchingSourceReadinessRepository(sourceRepository),
      paperMaterialRepository:
        paperMaterialRepository ?? new MatchingSourcePaperMaterialRepository(sourceRepository),
      aiReasoningRepository,
      close: client.close,
    },
  };
}

function createAiReasoningContext(input: {
  options: MatchingActionOptions;
  repository?: AiReasoningRepository | undefined;
}): {
  provider?: AiReasoningProvider | undefined;
  repository?: AiReasoningRepository | undefined;
  options: Partial<AiReasoningOptions>;
} {
  const env = input.options.env ?? process.env;

  return {
    provider: input.options.aiReasoningProvider ?? createConfiguredAiReasoningProvider(env),
    repository: input.options.aiReasoningRepository ?? input.repository,
    options: {
      ...readAiReasoningOptionsFromEnv(env),
      ...input.options.aiReasoningOptions,
    },
  };
}

function readAiReasoningOptionsFromEnv(
  env: Record<string, string | undefined>,
): Partial<AiReasoningOptions> {
  const options: Partial<AiReasoningOptions> = {};
  const timeoutMs = parsePositiveInteger(env.AI_REASONING_TIMEOUT_MS);
  const dailyLimit = parsePositiveInteger(env.AI_REASONING_DAILY_LIMIT);

  if (timeoutMs !== undefined) {
    options.timeoutMs = timeoutMs;
  }

  if (dailyLimit !== undefined) {
    options.dailyLimit = dailyLimit;
  }

  return options;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function resolveConfirmedBy(options: MatchingActionOptions): Promise<string> {
  const authOptions: {
    env?: Record<string, string | undefined>;
    cookieStore?: SessionCookieReader;
    now?: Date;
  } = {};

  if (options.env) {
    authOptions.env = options.env;
  }

  if (options.cookieStore) {
    authOptions.cookieStore = options.cookieStore;
  }

  if (options.now) {
    authOptions.now = options.now;
  }

  const user = await readAuthenticatedUser(authOptions);

  return user?.username ?? "guest";
}

function limitRejectedCandidatesForClient(
  rejectedCandidates: RejectedCandidateEvaluation[],
): RejectedCandidateEvaluation[] {
  return rejectedCandidates.slice(0, RETURNED_REJECTED_CANDIDATE_LIMIT);
}


function toHistoryRecordInput({
  snapshot,
  confirmedBy,
}: {
  snapshot: MatchingSchemeHistorySnapshot;
  confirmedBy: string;
}): MatchingSchemeHistoryRecordInput {
  return {
    boxSpecSnapshot: snapshot.boxSpecSnapshot as unknown as Record<string, unknown>,
    originalRecommendationSlotsSnapshot: snapshot.originalRecommendationSlotsSnapshot as unknown[],
    finalSchemeSnapshot: snapshot.finalSchemeSnapshot as unknown as Record<string, unknown>,
    priceSnapshot: snapshot.priceSnapshot as unknown[],
    parameterVersion: snapshot.parameterVersion,
    isManuallyAdjusted: snapshot.isManuallyAdjusted,
    exportRecords: snapshot.exportRecords,
    confirmedBy,
    createdAt: snapshot.savedAt,
  };
}

function resolveFinalStatus(evaluation: CandidateEvaluation): MatchingSchemeFinalStatus {
  if (evaluation.status === "eligible") {
    return "qualified";
  }

  if (evaluation.reasons.some((reason) => reason.type === "NOT_MANUFACTURABLE")) {
    return "not_manufacturable";
  }

  if (evaluation.reasons.some((reason) => reason.type === "STRENGTH_UNQUALIFIED")) {
    return "unqualified";
  }

  return "data_incomplete";
}

function createWarningMessages(finalStatus: MatchingSchemeFinalStatus): string[] {
  if (finalStatus === "unqualified") {
    return ["最终方案未达标，不建议生产"];
  }

  if (finalStatus === "not_manufacturable") {
    return ["最终方案不可生产，不建议生产"];
  }

  if (finalStatus === "data_incomplete") {
    return ["最终方案数据不足，请补全基础数据后再用于生产"];
  }

  return [];
}
