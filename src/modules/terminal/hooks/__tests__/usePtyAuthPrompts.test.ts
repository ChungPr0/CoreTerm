import { describe, expect, it } from "vitest";
import { enqueuePrompt, pruneQueueByTabs } from "../usePtyAuthPrompts";

describe("usePtyAuthPrompts queue helpers", () => {
  it("queues concurrent prompts across tabs/sources without overwriting earlier prompts", () => {
    let queue = enqueuePrompt([], { tab_id: "t1", attempt: 1 }, "pty");
    queue = enqueuePrompt(queue, { tab_id: "t1", attempt: 1 }, "sftp");
    queue = enqueuePrompt(queue, { tab_id: "t2", attempt: 1 }, "pty");

    expect(queue).toHaveLength(3);
    expect(queue.map((q) => `${q.prompt.tab_id}:${q.source}`)).toEqual([
      "t1:pty",
      "t1:sftp",
      "t2:pty",
    ]);

    // Retry for same (tab_id, source) updates in place rather than duplicating.
    queue = enqueuePrompt(queue, { tab_id: "t1", attempt: 2 }, "pty");
    expect(queue).toHaveLength(3);
    expect(queue[0].prompt.attempt).toBe(2);
  });

  it("prunes prompts belonging to closed tabs while preserving active tab prompts", () => {
    const queue = [
      { prompt: { tab_id: "t1" }, source: "pty" as const },
      { prompt: { tab_id: "t2" }, source: "sftp" as const },
    ];
    const pruned = pruneQueueByTabs(queue, new Set(["t2"]));
    expect(pruned).toHaveLength(1);
    expect(pruned[0].prompt.tab_id).toBe("t2");
    // Referential equality when nothing was pruned
    expect(pruneQueueByTabs(pruned, new Set(["t2"]))).toBe(pruned);

    // Prune all when all tabs are closed
    const emptyPruned = pruneQueueByTabs(queue, new Set());
    expect(emptyPruned).toEqual([]);

    // Safe with empty queue
    expect(pruneQueueByTabs([], new Set(["t1"]))).toEqual([]);
  });

  it("preserves queue ordering while updating prompt attempts in-place", () => {
    let queue = enqueuePrompt([], { tab_id: "t1", attempt: 1 }, "pty");
    queue = enqueuePrompt(queue, { tab_id: "t2", attempt: 1 }, "pty");
    queue = enqueuePrompt(queue, { tab_id: "t3", attempt: 1 }, "pty");

    // Re-enqueueing t2 with attempt 2 should update t2 in the middle
    queue = enqueuePrompt(queue, { tab_id: "t2", attempt: 2 }, "pty");
    expect(queue.map((q) => q.prompt.tab_id)).toEqual(["t1", "t2", "t3"]);
    expect(queue[1].prompt.attempt).toBe(2);
  });
});
