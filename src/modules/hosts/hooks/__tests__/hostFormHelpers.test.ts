import { describe, expect, it } from "vitest";
import type { HostFullConfigDto } from "../../types";
import {
  clampReconnectInterval,
  createHostFormFields,
  isAutoReconnectAllowed,
  validateAndBuildHostPayload,
} from "../hostFormHelpers";

const SAMPLE_HOST: HostFullConfigDto = {
  id: "h-1",
  alias: "Prod API",
  host: "10.10.0.5",
  port: 2222,
  username: "deploy",
  group_name: "Production",
  tags: ["api", "eu"],
  auth_method: "SSH_KEY",
  ssh_key_id: "key-1",
  private_key_path: "C:\\keys\\id_ed25519",
  password_mode: "NONE",
  has_saved_password: false,
  last_connected_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  options: {
    host_id: "h-1",
    server_alive_interval: 30,
    server_alive_count_max: 3,
    compression: true,
    strict_host_key_checking: "YES",
    startup_command: "tmux a",
    forward_agent: true,
    auto_reconnect: true,
    reconnect_interval_sec: 5,
  },
  port_forwards: [
    {
      id: "pf-1",
      host_id: "h-1",
      label: "SOCKS",
      forward_type: "DYNAMIC",
      bind_address: "127.0.0.1",
      bind_port: 1080,
      target_host: null,
      target_port: null,
      is_enabled: true,
    },
  ],
};

describe("hostFormHelpers", () => {
  it("hydrates form state from existing host and validates required fields", () => {
    const empty = createHostFormFields(null, "Ops");
    expect(empty.groupName).toBe("Ops");
    expect(validateAndBuildHostPayload(empty)).toEqual({
      ok: false,
      errorKey: "errors.host_alias_empty",
    });

    const fields = createHostFormFields(SAMPLE_HOST);
    expect(fields.tagsInput).toBe("api, eu");
    const built = validateAndBuildHostPayload(fields);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.payload.ssh_key_id).toBe("key-1");
      expect(built.payload.private_key_path).toBeNull();
      expect(built.payload.port_forwards?.[0].target_host).toBeNull();
    }
  });

  it("deduplicates tags and trims whitespace", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    fields.tagsInput = "api, eu, api, prod,  eu ";
    const built = validateAndBuildHostPayload(fields);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.payload.tags).toEqual(["api", "eu", "prod"]);
    }
  });

  it("rejects out-of-range ports and unbound SSH_KEY profiles", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    expect(validateAndBuildHostPayload({ ...fields, port: 70000 })).toEqual({
      ok: false,
      errorKey: "errors.host_port_range",
    });
    expect(
      validateAndBuildHostPayload({ ...fields, selectedKeyId: "", privateKeyPath: "   " })
    ).toEqual({
      ok: false,
      errorKey: "errors.key_binding_required",
    });
  });

  it("validates password requirement for SAVED password mode", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    fields.authMethod = "PASSWORD";
    fields.passwordMode = "SAVED";
    fields.password = "";
    expect(validateAndBuildHostPayload(fields, false)).toEqual({
      ok: false,
      errorKey: "errors.host_password_empty",
    });
    expect(validateAndBuildHostPayload(fields, true).ok).toBe(true);
    fields.password = "new-secret";
    expect(validateAndBuildHostPayload(fields, false).ok).toBe(true);
  });

  it("rejects host and username starting with hyphen or containing whitespace/control chars", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    expect(validateAndBuildHostPayload({ ...fields, host: "-oProxyCommand=calc" })).toEqual({
      ok: false,
      errorKey: "errors.host_host_invalid_hyphen",
    });
    expect(validateAndBuildHostPayload({ ...fields, host: "host with space" })).toEqual({
      ok: false,
      errorKey: "errors.host_host_invalid_chars",
    });
    expect(validateAndBuildHostPayload({ ...fields, username: "-F/evil/config" })).toEqual({
      ok: false,
      errorKey: "errors.host_username_invalid_hyphen",
    });
    expect(validateAndBuildHostPayload({ ...fields, username: "user with space" })).toEqual({
      ok: false,
      errorKey: "errors.host_username_invalid_chars",
    });
  });

  it("handles boundary reconnection intervals and auto-reconnect eligibility", () => {
    expect(clampReconnectInterval(-10)).toBe(1);
    expect(clampReconnectInterval(0)).toBe(2);
    expect(clampReconnectInterval(Number.NaN)).toBe(2);
    expect(clampReconnectInterval(10)).toBe(10);
    expect(clampReconnectInterval(100)).toBe(60);

    expect(isAutoReconnectAllowed("SSH_KEY")).toBe(true);
    expect(isAutoReconnectAllowed("PASSWORD", "SAVED")).toBe(true);
    expect(isAutoReconnectAllowed("PASSWORD", "PROMPT_EVERY_TIME")).toBe(false);
    expect(isAutoReconnectAllowed("PASSWORD", null)).toBe(false);
  });

  it("rejects non-integer and boundary invalid ports", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    expect(validateAndBuildHostPayload({ ...fields, port: 0 })).toEqual({
      ok: false,
      errorKey: "errors.host_port_range",
    });
    expect(validateAndBuildHostPayload({ ...fields, port: -22 })).toEqual({
      ok: false,
      errorKey: "errors.host_port_range",
    });
    expect(validateAndBuildHostPayload({ ...fields, port: 65536 })).toEqual({
      ok: false,
      errorKey: "errors.host_port_range",
    });
    expect(validateAndBuildHostPayload({ ...fields, port: 22.5 })).toEqual({
      ok: false,
      errorKey: "errors.host_port_range",
    });
  });

  it("disallows autoReconnect when password mode is PROMPT_EVERY_TIME", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    fields.authMethod = "PASSWORD";
    fields.passwordMode = "PROMPT_EVERY_TIME";
    fields.autoReconnect = true;

    const res = validateAndBuildHostPayload(fields);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.options?.auto_reconnect).toBe(false);
    }
  });

  it("rejects empty alias, empty host, and empty username", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    expect(validateAndBuildHostPayload({ ...fields, alias: "   " })).toEqual({
      ok: false,
      errorKey: "errors.host_alias_empty",
    });
    expect(validateAndBuildHostPayload({ ...fields, host: "   " })).toEqual({
      ok: false,
      errorKey: "errors.host_host_empty",
    });
    expect(validateAndBuildHostPayload({ ...fields, username: "   " })).toEqual({
      ok: false,
      errorKey: "errors.host_username_empty",
    });
  });

  it("maps LOCAL, REMOTE, and DYNAMIC port forward rules accurately", () => {
    const fields = createHostFormFields(SAMPLE_HOST);
    fields.groupName = "   "; // Test default group fallback
    fields.forwards = [
      {
        id: "f-local",
        label: "Local DB",
        forward_type: "LOCAL",
        bind_address: "127.0.0.1",
        bind_port: 5432,
        target_host: "10.0.0.9",
        target_port: 5432,
        is_enabled: true,
      },
      {
        id: "f-remote",
        label: "Remote Web",
        forward_type: "REMOTE",
        bind_address: "0.0.0.0",
        bind_port: 8080,
        target_host: "localhost",
        target_port: 3000,
        is_enabled: true,
      },
      {
        id: "f-dyn",
        label: "Dynamic Proxy",
        forward_type: "DYNAMIC",
        bind_address: "127.0.0.1",
        bind_port: 1080,
        target_host: "ignored-host",
        target_port: 9999,
        is_enabled: false,
      },
    ];

    const res = validateAndBuildHostPayload(fields);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.group_name).toBe("Default");
      expect(res.payload.port_forwards).toHaveLength(3);

      const [loc, rem, dyn] = res.payload.port_forwards ?? [];
      expect(loc.target_host).toBe("10.0.0.9");
      expect(loc.target_port).toBe(5432);

      expect(rem.target_host).toBe("localhost");
      expect(rem.target_port).toBe(3000);

      // DYNAMIC forces target_host and target_port to null
      expect(dyn.target_host).toBeNull();
      expect(dyn.target_port).toBeNull();
      expect(dyn.is_enabled).toBe(false);
    }
  });
});
