import { invoke } from "@/shared/api/tauriClient";
import type { DeleteResultDto } from "@/shared/types/ipc";
import type {
  GenerateSshKeyRequestDto,
  ImportSshKeyRequestDto,
  SshKeyDto,
} from "../types";

export const keysApi = {
  keyList(): Promise<SshKeyDto[]> {
    return invoke<SshKeyDto[]>("key_list", {});
  },

  keyGetDefault(): Promise<SshKeyDto | null> {
    return invoke<SshKeyDto | null>("key_get_default", {});
  },

  keyGenerate(req: GenerateSshKeyRequestDto): Promise<SshKeyDto> {
    return invoke<SshKeyDto>("key_generate", { req });
  },

  keyImport(req: ImportSshKeyRequestDto): Promise<SshKeyDto> {
    return invoke<SshKeyDto>("key_import", { req });
  },

  keySetDefault(keyId: string | null): Promise<{ updated: boolean }> {
    return invoke<{ updated: boolean }>("key_set_default", { key_id: keyId });
  },

  keyDelete(keyId: string, deleteFileFromDisk: boolean): Promise<DeleteResultDto> {
    return invoke<DeleteResultDto>("key_delete", {
      key_id: keyId,
      delete_file_from_disk: deleteFileFromDisk,
    });
  },
};
