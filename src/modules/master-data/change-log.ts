import type {
  MasterDataChangeLogRecord,
  MasterDataEntityType,
  MasterDataImportRepository,
} from "@/modules/master-data/import-commit";

export interface GetMasterDataChangeHistoryInput {
  entityType: MasterDataEntityType;
  entityId: string;
}

export interface GetMasterDataChangeHistoryResult {
  items: MasterDataChangeLogRecord[];
}

export async function getMasterDataChangeHistoryFromRepository({
  repository,
  input,
}: {
  repository: MasterDataImportRepository;
  input: GetMasterDataChangeHistoryInput;
}): Promise<GetMasterDataChangeHistoryResult> {
  return {
    items: await repository.listChangeLogs(input),
  };
}
