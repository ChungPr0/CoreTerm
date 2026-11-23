import { describe, expect, it } from "vitest";
import { SFTP_AUTH_BLOCKED_RE } from "@/shared/defaults";
import { MAX_RECONNECT_BACKOFF_SEC, nextReconnectDelayMs } from "../useAutoReconnect";

describe("useAutoReconnect backoff", () => {
  it("applies exponential backoff capped at max interval", () => {
    expect(nextReconnectDelayMs(2, 0)).toBe(2000);
    expect(nextReconnectDelayMs(2, 1)).toBe(4000);
    expect(nextReconnectDelayMs(2, 2)).toBe(8000);
    expect(nextReconnectDelayMs(2, 3)).toBe(16000);
    expect(nextReconnectDelayMs(2, 4)).toBe(MAX_RECONNECT_BACKOFF_SEC * 1000);
    expect(nextReconnectDelayMs(2, 10)).toBe(MAX_RECONNECT_BACKOFF_SEC * 1000);
  });

  it("clamps base interval and respects larger user intervals", () => {
    expect(nextReconnectDelayMs(undefined, 0)).toBe(2000);
    expect(nextReconnectDelayMs(0, 0)).toBe(2000);
    expect(nextReconnectDelayMs(0.2, 0)).toBe(1000);
    expect(nextReconnectDelayMs(45, 0)).toBe(45000);
    expect(nextReconnectDelayMs(45, 3)).toBe(45000);
    expect(nextReconnectDelayMs(120, 0)).toBe(60000);
  });

  it("blocks auto-reconnect on SFTP auth/key/host-key errors but allows network retries", () => {
    const blockedErrors = [
      "Authentication cancelled",
      "Authentication failed after 3 attempts",
      "Public key authentication failed",
      "SSH server rejected the private key",
      "Key passphrase prompt was cancelled",
      "Invalid SSH key passphrase after 3 attempts",
      "Failed to load SSH private key '/tmp/id_ed25519': bad format",
      "SSH_KEY authentication requires a valid private_key_path",
      "Host key verification failed",
      "Unknown key",
    ];
    for (const msg of blockedErrors) {
      expect(SFTP_AUTH_BLOCKED_RE.test(msg), msg).toBe(true);
    }

    const retryableErrors = [
      "SSH connection timed out",
      "Connection refused (os error 10061)",
      "Connection lost",
      "Broken pipe",
      "Sender dropped",
    ];
    for (const msg of retryableErrors) {
      expect(SFTP_AUTH_BLOCKED_RE.test(msg), msg).toBe(false);
    }
  });
});
