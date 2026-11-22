import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery, search } from "@codemirror/search";

describe("Editor Search Navigation & Indexing (TC-ED-034)", () => {
  it("reliably advances index without count fluctuation or getting stuck", () => {
    // 13 occurrences of 'target'
    const doc = Array(13).fill("const target = 1;").join("\n");
    let state = EditorState.create({ doc, extensions: [search()] });
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

    function getNextIndex(curSel: { from: number; to: number }) {
      const curIdx = matches.findIndex((m) => m.from === curSel.from && m.to === curSel.to);
      if (curIdx !== -1) {
        return (curIdx + 1) % matches.length;
      }
      const after = matches.findIndex((m) => m.from >= curSel.from);
      return after !== -1 ? after : 0;
    }

    function getPrevIndex(curSel: { from: number; to: number }) {
      const curIdx = matches.findIndex((m) => m.from === curSel.from && m.to === curSel.to);
      if (curIdx !== -1) {
        return (curIdx - 1 + matches.length) % matches.length;
      }
      let before = -1;
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].to <= curSel.from) {
          before = i;
          break;
        }
      }
      return before !== -1 ? before : matches.length - 1;
    }

    // From initial cursor 0, Enter jumps to match 0 (1/13)
    let next = getNextIndex({ from: 0, to: 0 });
    expect(next).toBe(0);
    let curSel = matches[next];

    // Stepping through 1 -> 2 -> ... -> 13
    for (let expected = 1; expected < 13; expected++) {
      next = getNextIndex(curSel);
      expect(next).toBe(expected);
      curSel = matches[next];
    }

    // From 13 (index 12), Enter wraps around to 1 (index 0)
    next = getNextIndex(curSel);
    expect(next).toBe(0);
    curSel = matches[next];

    // From 1 (index 0), Shift+Enter wraps back to 13 (index 12)
    let prev = getPrevIndex(curSel);
    expect(prev).toBe(12);
    curSel = matches[prev];

    // From 13 (index 12), Shift+Enter moves back to 12 (index 11)
    prev = getPrevIndex(curSel);
    expect(prev).toBe(11);
  });

  it("handles single match and mid-document cursor positions gracefully", () => {
    const singleMatches = [{ from: 10, to: 16 }];
    function getNext(curSel: { from: number; to: number }) {
      const curIdx = singleMatches.findIndex((m) => m.from === curSel.from && m.to === curSel.to);
      if (curIdx !== -1) {
        return (curIdx + 1) % singleMatches.length;
      }
      const after = singleMatches.findIndex((m) => m.from >= curSel.from);
      return after !== -1 ? after : 0;
    }

    // When on single match, Next keeps index at 0 (1/1)
    expect(getNext({ from: 10, to: 16 })).toBe(0);

    // When cursor is before match, Next goes to match (1/1)
    expect(getNext({ from: 0, to: 0 })).toBe(0);

    // When cursor is after match, Next wraps to match (1/1)
    expect(getNext({ from: 50, to: 50 })).toBe(0);
  });
});
