import { describe, expect, it } from "vitest";
import type { HostFullConfigDto } from "../../types";
import { createHostFormFields, validateAndBuildHostPayload } from "../hostFormHelpers";

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
});
