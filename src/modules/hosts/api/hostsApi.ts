import { invoke } from "@/shared/api/tauriClient";
import type { DeleteResultDto } from "@/shared/types/ipc";
import type {
  CreateHostRequestDto,
  HostFullConfigDto,
  HostProfileSummaryDto,
  PortForwardRuleDto,
  PortProbeResultDto,
  UpdateHostRequestDto,
  UpsertPortForwardRequestDto,
} from "../types";

export const hostsApi = {
  hostList(params?: {
    group_filter?: string;
    tag_filter?: string;
    search_query?: string;
  }): Promise<HostProfileSummaryDto[]> {
    return invoke<HostProfileSummaryDto[]>("host_list", {
      group_filter: params?.group_filter ?? null,
      tag_filter: params?.tag_filter ?? null,
      search_query: params?.search_query ?? null,
    });
  },

  hostGetDetail(hostId: string): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_get_detail", { host_id: hostId });
  },

  hostCreate(req: CreateHostRequestDto): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_create", { req });
  },

  hostUpdate(req: UpdateHostRequestDto): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_update", { req });
  },

  hostDuplicate(
    hostId: string,
    newAlias: string,
    newHost: string
  ): Promise<HostFullConfigDto> {
    return invoke<HostFullConfigDto>("host_duplicate", {
      host_id: hostId,
      new_alias: newAlias,
      new_host: newHost,
    });
  },

  hostDelete(hostId: string): Promise<DeleteResultDto> {
    return invoke<DeleteResultDto>("host_delete", { host_id: hostId });
  },

  hostGroupList(): Promise<string[]> {
    return invoke<string[]>("host_group_list", {});
  },

  hostGroupCreate(name: string): Promise<string> {
    return invoke<string>("host_group_create", { name });
  },

  hostGroupDelete(name: string): Promise<DeleteResultDto> {
    return invoke<DeleteResultDto>("host_group_delete", { name });
  },

  hostGroupReorder(groupNames: string[]): Promise<string[]> {
    return invoke<string[]>("host_group_reorder", { group_names: groupNames });
  },

  hostMoveGroup(hostId: string, groupName: string): Promise<string> {
    return invoke<string>("host_move_group", {
      host_id: hostId,
      group_name: groupName,
    });
  },

  portForwardUpsert(req: UpsertPortForwardRequestDto): Promise<PortForwardRuleDto> {
    return invoke<PortForwardRuleDto>("port_forward_upsert", { req });
  },

  portForwardToggle(
    ruleId: string,
    isEnabled: boolean
  ): Promise<{ rule_id: string; is_enabled: boolean }> {
    return invoke<{ rule_id: string; is_enabled: boolean }>(
      "port_forward_toggle",
      {
        rule_id: ruleId,
        is_enabled: isEnabled,
      }
    );
  },

  portForwardDelete(ruleId: string): Promise<DeleteResultDto> {
    return invoke<DeleteResultDto>("port_forward_delete", {
      rule_id: ruleId,
    });
  },

  portForwardProbe(hostId: string): Promise<PortProbeResultDto[]> {
    return invoke<PortProbeResultDto[]>("port_forward_probe", {
      host_id: hostId,
    });
  },

  portCheckAvailable(
    bindAddress: string,
    bindPort: number
  ): Promise<PortProbeResultDto> {
    return invoke<PortProbeResultDto>("port_check_available", {
      bind_address: bindAddress,
      bind_port: bindPort,
    });
  },
};
