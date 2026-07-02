import { createDatabaseClient, getDatabaseUrl } from "@/db";
import {
  buildMatchingSchemePdfData,
} from "@/modules/import-export/build-matching-scheme-pdf-data";
import { generateMatchingSchemePdf } from "@/modules/import-export/generate-matching-scheme-pdf";
import {
  isMatchingSchemePdfExportType,
  type MatchingSchemePdfData,
} from "@/modules/import-export/matching-scheme-pdf-types";
import { renderMatchingSchemePdfHtml } from "@/modules/import-export/render-matching-scheme-pdf-html";
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

interface MatchingSchemePdfRouteOptions {
  env?: Record<string, string | undefined>;
  cookieStore?: SessionCookieReader | undefined;
  now?: Date | undefined;
  repository?: MatchingSchemeHistoryRepository | undefined;
  generatePdfBuffer?:
    | ((input: { data: MatchingSchemePdfData; html: string }) => Promise<Buffer>)
    | undefined;
}

interface RouteContext {
  params: { schemeId: string } | Promise<{ schemeId: string }>;
}

const EXPORT_FAILED_MESSAGE = "导出失败，请稍后重试";

export function createMatchingSchemePdfRouteHandler(options: MatchingSchemePdfRouteOptions = {}) {
  return {
    async GET(request: Request, context: RouteContext): Promise<Response> {
      const authResult = await requireAuthenticatedAction(buildAuthOptions(options));

      if (!authResult.ok) {
        return jsonResponse(authResult.error.message, 401);
      }

      const url = new URL(request.url);
      const type = url.searchParams.get("type");

      if (!isMatchingSchemePdfExportType(type)) {
        return jsonResponse("导出类型无效", 400);
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

        if (getFinalStatus(findResult.data.finalSchemeSnapshot) !== "qualified") {
          return jsonResponse("当前方案不可导出", 409);
        }

        const data = buildMatchingSchemePdfData({
          record: findResult.data,
          type,
        });
        const html = renderMatchingSchemePdfHtml(data);
        const pdfBuffer = await (options.generatePdfBuffer ?? defaultGeneratePdfBuffer)({
          data,
          html,
        });
        const appendResult = await appendMatchingSchemeExportRecord({
          repository: repositoryContext.data.repository,
          schemeId,
          exportRecord: {
            type,
            exportedAt: (options.now ?? new Date()).toISOString(),
          },
        });

        if (!appendResult.ok || !appendResult.data) {
          return jsonResponse(EXPORT_FAILED_MESSAGE, 500);
        }

        return new Response(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.fileName)}`,
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

const defaultHandler = createMatchingSchemePdfRouteHandler();

export const GET = defaultHandler.GET;

async function defaultGeneratePdfBuffer({
  data,
  html,
}: {
  data: MatchingSchemePdfData;
  html: string;
}): Promise<Buffer> {
  return generateMatchingSchemePdf({ data, html });
}

async function resolveParams(
  params: RouteContext["params"],
): Promise<{ schemeId: string }> {
  return params instanceof Promise ? params : Promise.resolve(params);
}

function createRepositoryContext({
  env = process.env,
  repository,
}: MatchingSchemePdfRouteOptions):
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

function getFinalStatus(snapshot: Record<string, unknown>): string {
  return typeof snapshot.finalStatus === "string" ? snapshot.finalStatus : "unknown";
}

function jsonResponse(message: string, status: number): Response {
  return Response.json({ message }, { status });
}

function buildAuthOptions(options: MatchingSchemePdfRouteOptions) {
  return {
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.cookieStore !== undefined ? { cookieStore: options.cookieStore } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  };
}
