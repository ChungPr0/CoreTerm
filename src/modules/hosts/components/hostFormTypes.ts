import type { ForwardType } from "@/shared/types/ipc";

export interface DraftPortForward {
  id?: string;
  label: string;
  forward_type: ForwardType;
  bind_address: string;
  bind_port: number;
  target_host: string;
  target_port: number;
  is_enabled: boolean;
}
