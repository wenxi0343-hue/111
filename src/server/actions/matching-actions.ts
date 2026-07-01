"use server";

import { createDatabaseClient, getDatabaseUrl } from "@/db";
import type { BoxSpecInput, NormalizedBoxSpec } from "@/modules/box-spec/types";
import { isStackingRequired, validateBoxSpecInput } from "@/modules/box-spec/validate-box-spec";
import { evaluateMatchingCandidates } from "@/modules/calculations/evaluate-matching-candidates";
import type {
  EligibleCandidateEvaluation,
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
import {
  checkMatchingReadinessFromRepository,
  createDrizzleMatchingReadinessRepository,
  type MatchingReadinessRepository,
} from "@/server/actions/matching-readiness";
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
}

export type GenerateMatchingSchemeInput = BoxSpecInput;

export interface GenerateMatchingSchemeResult {
  boxSpec: NormalizedBoxSpec;
  stackingIncluded: boolean;
  stackingDisplayText: string;
  recommendations: EligibleCandidateEvaluation[];
  rejectedSummary: RejectedCandidateSummary[];
  rejectedCandidates: RejectedCandidateEvaluation[];
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

    return {
      ok: true,
      data: {
        boxSpec: validationResult.data,
        stackingIncluded: isStackingRequired(validationResult.data),
        stackingDisplayText: validationResult.data.stackingRequirement.displayText,
        recommendations: evaluation.eligibleCandidates,
        rejectedSummary: evaluation.rejectedSummary,
        rejectedCandidates: evaluation.rejectedCandidates,
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
