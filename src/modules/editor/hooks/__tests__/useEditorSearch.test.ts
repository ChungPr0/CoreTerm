import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery, search } from "@codemirror/search";
import {
  resolveActiveMatchIndex,
  resolveNextMatchIndex,
  resolvePrevMatchIndex,
} from "../useEditorSearch";

describe("Editor Search Navigation & Indexing (TC-ED-034)", () => {
  it("reliably advances index without skipping the first match or getting stuck", () => {
    // 13 occurrences of 'target'
    const doc = Array(13).fill("const target = 1;").join("\n");
    const state = EditorState.create({ doc, extensions: [search()] });
    const query = new SearchQuery({ search: "target" });

    const cursor = query.getCursor(state) as {
      next: () => { value?: { from: number; to: number }; done?: boolean };
    };
    const matches: Array<{ from: number; to: number }> = [];
    while (matches.length < 5000) {
      const step = cursor.next();
      if (step.done || !step.value) break;
      matches.push({ from: step.value.from, to: step.value.to });
    }
    expect(matches.length).toBe(13);

    // From initial cursor 0 (before first match), active display is 1/13 and first Enter selects match 0 (not match 1!)
    expect(resolveActiveMatchIndex(matches, { from: 0, to: 0 })).toBe(0);
    let next = resolveNextMatchIndex(matches, { from: 0, to: 0 });
    expect(next).toBe(0);
    let curSel = matches[next];

    // Stepping through 1 -> 2 -> ... -> 13
    for (let expected = 1; expected < 13; expected++) {
      next = resolveNextMatchIndex(matches, curSel);
      expect(next).toBe(expected);
      curSel = matches[next];
    }

    // From 13 (index 12), Enter wraps around to 1 (index 0)
    next = resolveNextMatchIndex(matches, curSel);
    expect(next).toBe(0);
    curSel = matches[next];

    // From 1 (index 0), Shift+Enter wraps back to 13 (index 12)
    let prev = resolvePrevMatchIndex(matches, curSel);
    expect(prev).toBe(12);
    curSel = matches[prev];

    // From 13 (index 12), Shift+Enter moves back to 12 (index 11)
    prev = resolvePrevMatchIndex(matches, curSel);
    expect(prev).toBe(11);
  });

  it("handles single match, mid-document cursor positions, and empty match lists", () => {
    const singleMatches = [{ from: 10, to: 16 }];

    // When on single match, Next keeps index at 0 (1/1)
    expect(resolveNextMatchIndex(singleMatches, { from: 10, to: 16 })).toBe(0);

    // When cursor is before match, Next goes to match (1/1)
    expect(resolveNextMatchIndex(singleMatches, { from: 0, to: 0 })).toBe(0);

    // When cursor is after match, Next wraps to match (1/1)
    expect(resolveNextMatchIndex(singleMatches, { from: 50, to: 50 })).toBe(0);

    // Mid-document cursor between two matches jumps forward on Next and backward on Prev
    const twoMatches = [
      { from: 5, to: 10 },
      { from: 30, to: 35 },
    ];
    expect(resolveNextMatchIndex(twoMatches, { from: 15, to: 15 })).toBe(1);
    expect(resolvePrevMatchIndex(twoMatches, { from: 15, to: 15 })).toBe(0);
    expect(resolvePrevMatchIndex(twoMatches, { from: 2, to: 2 })).toBe(1);

    // Empty matches return -1
    expect(resolveActiveMatchIndex([], { from: 0, to: 0 })).toBe(-1);
    expect(resolveNextMatchIndex([], { from: 0, to: 0 })).toBe(-1);
    expect(resolvePrevMatchIndex([], { from: 0, to: 0 })).toBe(-1);
  });
});
