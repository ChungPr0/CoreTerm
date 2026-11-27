import { describe, expect, it } from "vitest";
import en from "@/shared/i18n/locales/en.json";
import vi from "@/shared/i18n/locales/vi.json";
import {
  dedupeErrorText,
  extractRawErrorMessage,
  formatLocalizedError,
  stripErrorPrefixes,
} from "@/shared/utils/formatError";

const lookup = (dict: Record<string, unknown>, key: string, params?: Record<string, string | number>) => {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  }
  if (typeof cur !== "string") return key;
  return params ? cur.replace(/\{\{(\w+)\}\}/g, (_, tok) => String(params[tok] ?? "")) : cur;
};

const viT = (key: string, params?: Record<string, string | number>) => lookup(vi, key, params);
const enT = (key: string, params?: Record<string, string | number>) => lookup(en, key, params);
const mockT = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("formatError utils", () => {
  it("dedupes repeated adjacent colon segments", () => {
    expect(dedupeErrorText("Permission denied: Permission denied")).toBe("Permission denied");
    expect(dedupeErrorText("IO error: io error: Disk full")).toBe("IO error: Disk full");
  });

  it("extracts messages from strings, Errors and DTOs", () => {
    expect(extractRawErrorMessage("  failed  ")).toBe("failed");
    expect(extractRawErrorMessage(new Error("boom"))).toBe("boom");
    expect(extractRawErrorMessage({ code: "SFTP_ERROR", message: "  denied " })).toBe("denied");
    expect(extractRawErrorMessage(null)).toBe("");
  });

  it("maps known errors and falls back to unknown key", () => {
    expect(formatLocalizedError("", mockT)).toBe("errors.unknown");
    expect(formatLocalizedError("Cannot delete Default group", mockT)).toBe(
      "errors.group_delete_default"
    );
  });

  it("localizes app CRUD validation errors and internal UAC cancel in vi and en", () => {
    const cases = [
      ["Validation error: Key name cannot be empty", "Tên khóa", "empty"],
      ["Validation error: Host/IP cannot be empty", "Host", "Host"],
      ["Validation error: Host cannot start with a hyphen '-': '-evil'", "gạch ngang", "hyphen"],
      ["Validation error: Host contains invalid whitespace or control characters: 'bad host'", "khoảng trắng", "whitespace"],
      ["Validation error: Username cannot start with a hyphen '-': '-user'", "gạch ngang", "hyphen"],
      ["Validation error: Username contains invalid whitespace or control characters: 'bad user'", "khoảng trắng", "whitespace"],
      ["Validation error: Executable 'calc.exe' is not an authorized interactive shell for elevated execution", "không thuộc danh sách", "authorized"],
      ["Validation error: Argument '-Command' is not permitted for elevated powershell shell (non-interactive execution blocked)", "không được phép", "permitted"],
      ["Validation error: Elevated shell executable cannot be empty", "không được để trống", "empty"],
      ["Validation error: Path to delete cannot be empty", "không được để trống", "empty"],
      ["Validation error: Deleting drive or root path is strictly prohibited: 'C:\\'", "ổ đĩa hoặc thư mục gốc", "drive or filesystem root"],
      ["Validation error: Deleting protected system path is prohibited: 'C:\\Windows'", "đường dẫn hệ thống được bảo vệ", "protected system path"],
      ["Validation error: Deleting the user profile root directory is strictly prohibited", "thư mục gốc của người dùng", "user profile root directory"],
      ["Validation error: Deleting application data directory is prohibited: 'C:\\Users\\user\\AppData\\Roaming\\CoreTerm'", "thư mục dữ liệu ứng dụng", "application data directory"],
      ["Cannot delete Default group", "nhóm Default", "Default"],
      ["PTY error: UAC_CANCELLED", "Administrator", "Administrator"],
      ["Validation error: Password is required", "Mật khẩu", "Password"],
      [
        "Validation error: Destination file was deleted or corrupted while paused",
        "Tệp tin đích đã bị xóa hoặc hỏng trong lúc tạm dừng",
        "Destination file was deleted or corrupted while paused",
      ],
      [
        "Validation error: Destination file was deleted or corrupted during transfer",
        "Tệp tin đích đã bị xóa hoặc hỏng trong lúc đang truyền tải",
        "Destination file was deleted or corrupted during transfer",
      ],
      [
        "Validation error: Remote destination file was deleted or corrupted while paused",
        "Tệp tin đích từ xa đã bị xóa hoặc hỏng trong lúc tạm dừng",
        "Remote destination file was deleted or corrupted while paused",
      ],
      [
        "Validation error: Source file was truncated while paused",
        "Tệp tin nguồn đã bị cắt ngắn trong lúc tạm dừng",
        "Source file was truncated while paused",
      ],
      [
        "Validation error: Source file was deleted or corrupted during transfer",
        "Tệp tin nguồn đã bị xóa hoặc hỏng trong lúc đang truyền tải",
        "Source file was deleted or corrupted during transfer",
      ],
      [
        "SFTP error: Permission denied: Permission denied",
        "Không có quyền truy cập",
        "Permission denied",
      ],
      [
        "Read '/home/chung/locked_dir': Permission denied",
        "Không có quyền truy cập",
        "Permission denied",
      ],
      [
        "Validation error: Entry name cannot be empty",
        "Tên tệp hoặc thư mục không được để trống",
        "Entry name cannot be empty",
      ],
      [
        "Resource not found: Transfer job not found: job-42",
        "Không tìm thấy tác vụ truyền tải",
        "Transfer job not found",
      ],
      [
        "SFTP error: Failed to create remote directory: File already exists",
        "Tệp tin hoặc thư mục đích đã tồn tại",
        "File or directory already exists",
      ],
      [
        "SFTP error: SSH connection timed out",
        "Kết nối SFTP đã hết thời gian chờ",
        "SFTP connection timed out",
      ],
      [
        "Validation error: LOCAL port forward requires a target host",
        "Host đích",
        "Target host",
      ],
      [
        "Validation error: Bind port must be between 1 and 65535",
        "65535",
        "65535",
      ],
      [
        "Internal error: Failed to open Windows clipboard",
        "bộ nhớ tạm",
        "clipboard",
      ],
      [
        "Validation error: Cannot rename root path: /",
        "thư mục gốc",
        "root path",
      ],
      [
        "Validation error: Target already exists: D:\\foo",
        "đã tồn tại",
        "already exists",
      ],
      [
        "Validation error: Invalid POSIX mode: 0o10000 (expected 0000..=7777)",
        "Quyền không hợp lệ",
        "Invalid permission mode",
      ],
      [
        "Validation error: SFTP cannot connect to the local shell pseudo-host",
        "terminal cục bộ",
        "local terminal",
      ],
      [
        "Validation error: File exceeds maximum editable size (2 MB)",
        "tối đa 2 MB",
        "2 MB",
      ],
      [
        "Validation error: Binary or non-UTF-8 file cannot be edited",
        "tệp nhị phân",
        "Binary",
      ],
      [
        "Validation error: Cannot edit a directory",
        "thư mục",
        "directory",
      ],
      [
        "SFTP error: Failed to write remote file: Disk full",
        "Không thể lưu tệp từ xa: Disk full",
        "Failed to write remote file: Disk full",
      ],
      [
        "SFTP error: Destination '/var/www/index.html' already exists",
        "đã tồn tại",
        "already exists",
      ],
      [
        "Validation error: Directory tree exceeds maximum transfer depth or entry limit",
        "giới hạn độ sâu",
        "maximum transfer depth",
      ],
      [
        "SFTP error: SSH server rejected the private key",
        "từ chối khóa",
        "rejected the private key",
      ],
      [
        "Validation error: Modifying protected system path is prohibited: 'C:\\Windows\\win.ini'",
        "đường dẫn hệ thống được bảo vệ",
        "protected system path",
      ],
      [
        "Validation error: Writing protected system path is prohibited: 'C:\\Windows\\System32\\evil.dll'",
        "đường dẫn hệ thống được bảo vệ",
        "protected system path",
      ],
      [
        "Validation error: Writing application data directory is prohibited: 'C:\\Users\\user\\AppData\\Roaming\\CoreTerm\\data\\app.db'",
        "thư mục dữ liệu ứng dụng",
        "application data directory",
      ],
      [
        "Validation error: Writing the user profile root directory is strictly prohibited",
        "thư mục gốc của người dùng",
        "user profile root directory",
      ],
      [
        "Resource not found: Local path not found: D:\\Workspace\\missing.txt",
        "Không tìm thấy đường dẫn cục bộ",
        "Local path not found",
      ],
      [
        "Cannot register debug executable to Windows startup because it requires the Vite dev server (localhost:1420).",
        "Không thể đăng ký khởi động cho bản debug",
        "Cannot register startup for debug builds",
      ],
      [
        "Cannot register network or UNC executable to Windows startup.",
        "đường dẫn mạng",
        "network path",
      ],
      [
        "The system cannot find the file specified. (os error 2)",
        "Tệp tin hoặc thư mục không tồn tại",
        "File or directory not found",
      ],
      [
        "Validation error: Update package checksum verification failed.",
        "Xác thực toàn vẹn gói cập nhật thất bại",
        "Update package checksum verification failed",
      ],
      [
        "Validation error: In-app update installation is only supported for installed builds.",
        "chỉ hỗ trợ cho bản đã cài vào máy",
        "only supported for installed builds",
      ],
    ] as const;

    for (const [raw, viSubstr, enSubstr] of cases) {
      const viMsg = formatLocalizedError(raw, viT);
      const enMsg = formatLocalizedError(raw, enT);
      expect(viMsg).not.toMatch(/^errors\./);
      expect(enMsg).not.toMatch(/^errors\./);
      expect(viMsg).toContain(viSubstr);
      expect(enMsg).toContain(enSubstr);
    }
  });

  it("strips redundant prefixes before colons and displays clean system errors", () => {
    const systemErrors = [
      ["banner exchange: Connection to UNKNOWN port -1: Connection refused", "Connection to UNKNOWN port -1: Connection refused"],
      [
        "SFTP error: SSH connect failed: No connection could be made because the target machine actively refused it. (os error 10061)",
        "No connection could be made because the target machine actively refused it. (os error 10061)",
      ],
      ["PTY error: Failed to open Windows ConPTY: access denied", "Failed to open Windows ConPTY: access denied"],
      ["SFTP error: SSH connect failed: Connection refused", "Connection refused"],
      ["SFTP error: Broken pipe", "Broken pipe"],
    ] as const;

    for (const [raw, expected] of systemErrors) {
      expect(formatLocalizedError(raw, viT)).toBe(expected);
      expect(formatLocalizedError(raw, enT)).toBe(expected);
      expect(stripErrorPrefixes(raw)).toBe(expected);
    }
  });
});
