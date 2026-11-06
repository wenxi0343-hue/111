import { createDatabaseClient, getDatabaseUrl } from "@/db";
import { buildMatchingSchemeWorkbook } from "@/modules/import-export/build-matching-scheme-workbook";
import {
  appendMatchingSchemeExportRecord,
  createDrizzleMatchingSchemeHistoryRepository,
  findMatchingSchemeHistoryById,
  type MatchingSchemeHistoryRepository,
} from "@/server/actions/matching-scheme-history";
import { requireAuthenticatedAction } from "@/server/guards/auth";

interface SessionCookieReader {
  get(name: string): { value: string } | undefined;
}

interface MatchingSchemeExcelRouteOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader | undefined;
  now?: Date | undefined;
  repository?: MatchingSchemeHistoryRepository | undefined;
  buildWorkbook?: typeof buildMatchingSchemeWorkbook | undefined;
}

interface RouteContext {
  params: { schemeId: string } | Promise<{ schemeId: string }>;
}

const EXPORT_FAILED_MESSAGE = "导出失败，请稍后重试";

export function createMatchingSchemeExcelRouteHandler(
  options: MatchingSchemeExcelRouteOptions = {},
) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

      if (!authResult.ok) {
        return jsonResponse(authResult.error.message, 401);
      }

      const { schemeId } = await resolveParams(context.params);
      const repositoryContext = createRepositoryContext(options);

      if (!repositoryContext.ok) {
        return jsonResponse(EXPORT_FAILED_MESSAGE, 500);
      }

      try {
        const findResult = await findMatchingSchemeHistoryById({
          repository: repositoryContext.data.repository,
          id: schemeId,
        });

        if (!findResult.ok) {
          return jsonResponse(EXPORT_FAILED_MESSAGE, 500);
        }

        if (!findResult.data) {
          return jsonResponse("方案记录不存在", 404);
        }

        const exportedAt = options.now ?? new Date();
        const workbook = await (options.buildWorkbook ?? buildMatchingSchemeWorkbook)({
          record: findResult.data,
          exportedAt,
        });
        const appendResult = await appendMatchingSchemeExportRecord({
          repository: repositoryContext.data.repository,
          schemeId,
          exportRecord: {
            type: "scheme_excel",
            exportedAt: exportedAt.toISOString(),
          },
        });

        if (!appendResult.ok || !appendResult.data) {
          return jsonResponse(EXPORT_FAILED_MESSAGE, 500);
        }

        return new Response(new Uint8Array(workbook.buffer), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
              workbook.fileName,
            )}`,
          },
        });
      } catch {
        return jsonResponse(EXPORT_FAILED_MESSAGE, 500);
      } finally {
        await repositoryContext.data.close?.();
      }
    },
  };
}

const defaultHandler = createMatchingSchemeExcelRouteHandler();

export const GET = defaultHandler.GET;

async function resolveParams(params: RouteContext["params"]): Promise<{ schemeId: string }> {
  return params instanceof Promise ? params : Promise.resolve(params);
}

function createRepositoryContext({
  env = process.env,
  repository,
}: MatchingSchemeExcelRouteOptions):
  | {
      ok: true;
      data: {
        repository: MatchingSchemeHistoryRepository;
        close?: (() => Promise<void>) | undefined;
      };
    }
  | { ok: false } {
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
    return { ok: false };
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

function jsonResponse(message: string, status: number): Response {
  return Response.json({ message }, { status });
}

function buildAuthOptions(options: MatchingSchemeExcelRouteOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}
