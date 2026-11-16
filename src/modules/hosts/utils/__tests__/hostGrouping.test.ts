import { describe, expect, it } from "vitest";
import type { HostProfileSummaryDto } from "../../types";
import { groupAndSortProfiles } from "../hostGrouping";

function mockHost(id: string, alias: string, group_name: string): HostProfileSummaryDto {
  return {
    id,
    alias,
    host: "127.0.0.1",
    port: 22,
    username: "root",
    group_name,
    tags: [],
    auth_method: "PASSWORD",
    ssh_key_id: null,
    ssh_key_name: null,
    private_key_path: null,
    password_mode: "PROMPT_EVERY_TIME",
    has_saved_password: false,
    active_port_forwards_count: 0,
    auto_reconnect: false,
    reconnect_interval_sec: 2,
    last_connected_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("groupAndSortProfiles", () => {
  it("preserves persisted group rank and hides empty groups while filtering", () => {
    const groups = ["Staging", "Default", "EmptyGroup"];
    const profiles = [
      mockHost("1", "web-1", "default"),
      mockHost("2", "db-1", "Staging"),
      mockHost("3", "extra", "AdHoc"),
    ];

    const unfiltered = groupAndSortProfiles(profiles, groups, false);
    expect(unfiltered.map(([name, list]) => [name, list.length])).toEqual([
      ["Staging", 1],
      ["Default", 1],
      ["EmptyGroup", 0],
      ["AdHoc", 1],
    ]);

    const filtered = groupAndSortProfiles([profiles[0]], groups, true);
    expect(filtered.map(([name]) => name)).toEqual(["Default"]);
  });
});
