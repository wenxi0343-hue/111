import { describe, expect, it, vi } from "vitest";

import { createSessionValue } from "@/modules/auth/session";
import type { MasterDataImportRepository } from "@/modules/master-data/import-commit";
import { previewMasterDataImport } from "@/server/actions/master-data-actions";

const sessionSecret = "master-data-scope-session-secret";
const validEnv = {
  AUTH_SESSION_SECRET: sessionSecret,
  AUTH_USERS_JSON: JSON.stringify([
    {
      username: "operator",
      displayName: "操作员",
      passwordHash: "scrypt$1024$8$1$c2FsdA$aGFzaA",
    },
  ]),
};

function createAuthenticatedCookieStore() {
  const session = createSessionValue({
    user: {
      username: "operator",
      displayName: "操作员",
    },
    sessionSecret,
    now: new Date("2026-06-30T00:00:00.000Z"),
  });

  return {
    get(name: string) {
      return name === "paper_box_auth_session" ? { value: session.value } : undefined;
    },
  };
}

function createPaperCodeImportFormData(fileName: string): FormData {
  const formData = new FormData();

  formData.set("sourceType", "paper_code_table");
  formData.set("file", new File(["脱敏测试内容"], fileName));

  return formData;
}

function createUnusedRepository() {
  return {
    listPaperMaterialsForPreview: vi.fn(),
    saveImportPreview: vi.fn(),
  } as unknown as MasterDataImportRepository;
}

describe("master data import scope boundaries", () => {
  it("rejects .xls files before parsing or saving an import preview", async () => {
    const repository = createUnusedRepository();

    const result = await previewMasterDataImport(createPaperCodeImportFormData("旧版表格.xls"), {
      env: validEnv,
      cookieStore: createAuthenticatedCookieStore(),
      repository,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "本功能只支持 .xlsx 和 .csv 文件",
      },
    });
    expect(repository.listPaperMaterialsForPreview).not.toHaveBeenCalled();
    expect(repository.saveImportPreview).not.toHaveBeenCalled();
  });

  it("keeps recent three-year order data outside this import flow", async () => {
    const repository = createUnusedRepository();

    const result = await previewMasterDataImport(
      createPaperCodeImportFormData("近三年订单数据.xls"),
      {
        env: validEnv,
        cookieStore: createAuthenticatedCookieStore(),
        repository,
      },
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "本功能只支持 .xlsx 和 .csv 文件",
      },
    });
    expect(repository.listPaperMaterialsForPreview).not.toHaveBeenCalled();
    expect(repository.saveImportPreview).not.toHaveBeenCalled();
  });
});
