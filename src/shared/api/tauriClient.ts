import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export { Channel, invoke, type UnlistenFn };

export function listenEvent<T>(
  eventName: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  return listen<T>(eventName, (event) => handler(event.payload));
}
