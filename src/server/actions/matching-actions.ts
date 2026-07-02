"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
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
  SingleFluteType,
} from "@/modules/calculations/types";
import {
  createDrizzleListRecommendablePaperMaterialsRepository,
  listRecommendablePaperMaterialsFromRepository,
  type ListRecommendablePaperMaterialsRepository,
  type RecommendablePaperMaterial,
} from "@/modules/master-data/list-recommendable-paper-materials";
import { selectMatchingRecommendations } from "@/modules/recommendation/select-matching-recommendations";
import type {
  RecommendationSlot,
  RecommendationStrategy,
  SelectMatchingRecommendationsResult,
} from "@/modules/recommendation/types";
import {
  buildAdjustedCandidate,
  isCandidateManuallyAdjusted,
} from "@/modules/scheme-adjustment/build-adjusted-candidate";
import { createHistorySnapshot } from "@/modules/scheme-adjustment/create-history-snapshot";
import type {
  MatchingSchemeFinalStatus,
  MatchingSchemeHistorySnapshot,
  RecalculateAdjustedSchemeResult,
  SchemeAdjustmentInput,
} from "@/modules/scheme-adjustment/types";
import {
  checkMatchingReadinessFromRepository,
  createDrizzleMatchingReadinessRepository,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
import {
  createDrizzleMatchingSchemeHistoryRepository,
  saveMatchingSchemeHistory,
  type MatchingSchemeHistoryRecordInput,
  type MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";
import { requireAuthenticatedAction } from "@/server/guards/auth";
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
      }) => SelectMatchingRecommendationsResult)
    | undefined;
  historyRepository?: MatchingSchemeHistoryRepository | undefined;
  evaluateCandidateFn?: ((input: EvaluateCandidateInput) => CandidateEvaluation) | undefined;
}

const MATCHING_SCHEME_NOT_SAVEABLE_MESSAGE = "当前方案未达标或不可生产，无法确认保存";

export type GenerateMatchingSchemeInput = BoxSpecInput;

export interface SaveConfirmedMatchingSchemeInput {
  boxSpec: BoxSpecInput;
  originalRecommendationSlots: RecommendationSlot[];
  selectedStrategy?: RecommendationStrategy | undefined;
  baseCandidate: MatchingCandidate;
  adjustments?: SchemeAdjustmentInput | undefined;
  clientState: "recalculated" | "dirty";
}

export interface RecalculateAdjustedSchemeInput {
  boxSpec: BoxSpecInput;
  selectedStrategy?: RecommendationStrategy | undefined;
  baseCandidate: MatchingCandidate;
  adjustments: SchemeAdjustmentInput;
}

export interface GenerateMatchingSchemeResult {
  boxSpec: NormalizedBoxSpec;
  stackingIncluded: boolean;
  stackingDisplayText: string;
  recommendationSlots: [RecommendationSlot, RecommendationSlot, RecommendationSlot];
  recommendationMessages: string[];
  rejectedSummary: RejectedCandidateSummary[];
  rejectedCandidates: RejectedCandidateEvaluation[];
}

export interface SaveConfirmedMatchingSchemeResult {
  schemeId: string;
  finalStatus: MatchingSchemeHistorySnapshot["finalStatus"];
  isManuallyAdjusted: boolean;
  warningMessages: string[];
  savedAt: string;
}

export async function recalculateAdjustedScheme(
  input: RecalculateAdjustedSchemeInput,
  options: MatchingActionOptions = {},
): Promise<ActionResult<RecalculateAdjustedSchemeResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

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

  const repositoryContext = createPaperMaterialRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const paperMaterials = await listRecommendablePaperMaterialsFromRepository({
      repository: repositoryContext.data.paperMaterialRepository,
    });
    const adjustedCandidateResult = buildAdjustedCandidate({
      baseCandidate: input.baseCandidate,
      adjustments: input.adjustments,
      paperMaterials: paperMaterials.items,
    });

    if (!adjustedCandidateResult.ok) {
      return adjustedCandidateResult;
    }

    const finalEvaluation = (options.evaluateCandidateFn ?? evaluateCandidate)({
      boxSpec: validationResult.data,
      candidate: adjustedCandidateResult.data,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });
    const finalStatus = resolveFinalStatus(finalEvaluation);

    return {
      ok: true,
      data: {
        finalEvaluation,
        finalStatus,
        isManuallyAdjusted: isCandidateManuallyAdjusted({
          baseCandidate: input.baseCandidate,
          adjustedCandidate: adjustedCandidateResult.data,
        }),
        warningMessages: createWarningMessages(finalStatus),
        canSave: finalStatus === "qualified",
      },
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

export async function generateMatchingScheme(
  input: GenerateMatchingSchemeInput,
  options: MatchingActionOptions = {},
): Promise<ActionResult<GenerateMatchingSchemeResult>> {
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

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
    const readinessResult = await checkMatchingReadinessFromRepository({
      repository: repositoryContext.data.repository,
    });

    if (!readinessResult.ok) {
      return readinessResult;
    }

    const paperMaterials = await listRecommendablePaperMaterialsFromRepository({
      repository: repositoryContext.data.paperMaterialRepository,
    });
    const candidates = (options.createCandidates ?? createDefaultMatchingCandidates)(
      paperMaterials.items,
    );
    const evaluation = (options.evaluateMatchingCandidatesFn ?? evaluateMatchingCandidates)({
      boxSpec: validationResult.data,
      candidates,
    });
    const recommendationResult = (
      options.selectMatchingRecommendationsFn ?? selectMatchingRecommendations
    )({
      evaluation,
      parameters: DEFAULT_CALCULATION_PARAMETERS,
    });

    return {
      ok: true,
      data: {
        boxSpec: validationResult.data,
        stackingIncluded: isStackingRequired(validationResult.data),
        stackingDisplayText: validationResult.data.stackingRequirement.displayText,
        recommendationSlots: recommendationResult.slots,
        recommendationMessages: recommendationResult.globalMessages,
        rejectedSummary: recommendationResult.rejectedSummary,
        rejectedCandidates: recommendationResult.rejectedCandidates,
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
  const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

  if (!authResult.ok) {
    return authResult;
  }

  if (input.clientState === "dirty") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "请先重新校核后再保存",
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
  const savedAt = options.now ?? new Date();
  const snapshotResult = createHistorySnapshot({
    boxSpec: validationResult.data,
    originalRecommendationSlots: input.originalRecommendationSlots,
    selectedStrategy: input.selectedStrategy,
    finalEvaluation,
    parameters: DEFAULT_CALCULATION_PARAMETERS,
    isManuallyAdjusted: finalCandidateResult.data.isManuallyAdjusted,
    savedAt,
  });

  if (!snapshotResult.ok) {
    return snapshotResult;
  }

  if (snapshotResult.data.finalStatus !== "qualified") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: MATCHING_SCHEME_NOT_SAVEABLE_MESSAGE,
      },
    };
  }

  const repositoryContext = createHistoryRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const saveResult = await saveMatchingSchemeHistory({
      repository: repositoryContext.data.repository,
      input: toHistoryRecordInput({
        snapshot: snapshotResult.data,
        confirmedBy: authResult.data.username,
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

async function resolveFinalCandidateForSave(
  input: SaveConfirmedMatchingSchemeInput,
  options: MatchingActionOptions,
): Promise<ActionResult<{ candidate: MatchingCandidate; isManuallyAdjusted: boolean }>> {
  if (!input.adjustments) {
    return {
      ok: true,
      data: {
        candidate: input.baseCandidate,
        isManuallyAdjusted: false,
      },
    };
  }

  const repositoryContext = createPaperMaterialRepositoryContext(options);

  if (!repositoryContext.ok) {
    return repositoryContext;
  }

  try {
    const paperMaterials = await listRecommendablePaperMaterialsFromRepository({
      repository: repositoryContext.data.paperMaterialRepository,
    });
    const adjustedCandidateResult = buildAdjustedCandidate({
      baseCandidate: input.baseCandidate,
      adjustments: input.adjustments,
      paperMaterials: paperMaterials.items,
    });

    if (!adjustedCandidateResult.ok) {
      return adjustedCandidateResult;
    }

    return {
      ok: true,
      data: {
        candidate: adjustedCandidateResult.data,
        isManuallyAdjusted: isCandidateManuallyAdjusted({
          baseCandidate: input.baseCandidate,
          adjustedCandidate: adjustedCandidateResult.data,
        }),
      },
    };
  } finally {
    await repositoryContext.data.close?.();
  }
}

function buildAuthOptions(options: MatchingActionOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}

function createHistoryRepositoryContext({
  env = process.env,
  historyRepository,
}: MatchingActionOptions): ActionResult<{
  repository: MatchingSchemeHistoryRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (historyRepository) {
    return {
      ok: true,
      data: {
        repository: historyRepository,
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
      close: client.close,
    },
  };
}

function createPaperMaterialRepositoryContext({
  env = process.env,
  paperMaterialRepository,
}: MatchingActionOptions): ActionResult<{
  paperMaterialRepository: ListRecommendablePaperMaterialsRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (paperMaterialRepository) {
    return {
      ok: true,
      data: {
        paperMaterialRepository,
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
      paperMaterialRepository: createDrizzleListRecommendablePaperMaterialsRepository(client.db),
      close: client.close,
    },
  };
}

function createMatchingRepositoryContext({
  env = process.env,
  paperMaterialRepository,
  readinessRepository,
}: MatchingActionOptions): ActionResult<{
  repository: MatchingReadinessRepository;
  paperMaterialRepository: ListRecommendablePaperMaterialsRepository;
  close?: (() => Promise<void>) | undefined;
}> {
  if (readinessRepository && paperMaterialRepository) {
    return {
      ok: true,
      data: {
        repository: readinessRepository,
        paperMaterialRepository,
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
      repository: createDrizzleMatchingReadinessRepository(client.db),
      paperMaterialRepository:
        paperMaterialRepository ?? createDrizzleListRecommendablePaperMaterialsRepository(client.db),
      close: client.close,
    },
  };
}

function createDefaultMatchingCandidates(
  materials: RecommendablePaperMaterial[],
): MatchingCandidate[] {
  const liners = materials.filter((material) => material.paperKind === "linerboard");
  const corrugatings = materials.filter((material) => material.paperKind === "corrugating");
  const candidates: MatchingCandidate[] = [];

  for (const outer of liners) {
    for (const inner of liners) {
      for (const corrugating of corrugatings) {
        for (const flute of getSingleFlutes(corrugating)) {
          candidates.push({
            id: `${outer.id}-${corrugating.id}-${inner.id}-${flute}`,
            layerCount: 3,
            fluteType: flute,
            layers: [
              {
                role: "outer_liner",
                paper: toCandidatePaperMaterial(outer),
              },
              {
                role: "corrugating",
                flute,
                paper: toCandidatePaperMaterial(corrugating),
              },
              {
                role: "inner_liner",
                paper: toCandidatePaperMaterial(inner),
              },
            ],
          });
        }
      }
    }
  }

  return candidates;
}

function getSingleFlutes(material: RecommendablePaperMaterial): SingleFluteType[] {
  const flutes = material.applicableFlutes.filter(isSingleFlute);

  return flutes.length > 0 ? flutes : ["B"];
}

function isSingleFlute(value: string): value is SingleFluteType {
  return value === "A" || value === "B" || value === "C" || value === "E";
}

function toCandidatePaperMaterial(material: RecommendablePaperMaterial) {
  return {
    id: material.id,
    paperCode: material.paperCode,
    factoryName: material.factoryName,
    name: material.name,
    gramWeightGsm: material.gramWeightGsm,
    priceYuanPerTon: material.priceYuanPerTon,
    burstIndex: material.burstIndex,
    ringCrushIndex: material.ringCrushIndex,
  };
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
    originalRecommendationSlotsSnapshot:
      snapshot.originalRecommendationSlotsSnapshot as unknown[],
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
