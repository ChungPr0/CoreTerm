import { invoke } from "@/shared/api/tauriClient";
import type {
  FileContentDto,
  FileWriteResultDto,
  LocalDriveDto,
  LocalListDirResultDto,
} from "../types";

export const localFsApi = {
  localListDrives(): Promise<LocalDriveDto[]> {
    return invoke<LocalDriveDto[]>("local_list_drives", {});
  },

  localHomeDir(): Promise<string> {
    return invoke<string>("local_home_dir", {});
  },

  localListDir(path: string): Promise<LocalListDirResultDto> {
    return invoke<LocalListDirResultDto>("local_list_dir", { path });
  },

  localCreateDir(parentDir: string, name: string): Promise<string> {
    return invoke<string>("local_create_dir", {
      parent_dir: parentDir,
      name,
    });
  },

  localCreateFile(parentDir: string, name: string): Promise<string> {
    return invoke<string>("local_create_file", {
      parent_dir: parentDir,
      name,
    });
  },

  localReadFile(path: string): Promise<FileContentDto> {
    return invoke<FileContentDto>("local_read_file", { path });
  },

  localWriteFile(path: string, content: string): Promise<FileWriteResultDto> {
    return invoke<FileWriteResultDto>("local_write_file", { path, content });
  },

  localRename(oldPath: string, newName: string): Promise<string> {
    return invoke<string>("local_rename", {
      old_path: oldPath,
      new_name: newName,
    });
  },

  localDelete(paths: string[]): Promise<void> {
    return invoke<void>("local_delete", { paths });
  },
};
