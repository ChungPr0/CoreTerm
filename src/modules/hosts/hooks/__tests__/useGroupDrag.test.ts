import { describe, expect, it } from "vitest";
import { applyGroupReorder, computeGroupInsertIndex } from "../useGroupDrag";

describe("useGroupDrag helpers", () => {
  it("computes insertion slot and ignores no-op adjacent slots", () => {
    const midpoints = [100, 200, 300];
    // Dragging index 0 ("Default"): slots 0 and 1 leave order unchanged.
    expect(computeGroupInsertIndex(midpoints, 50, 0)).toBeNull();
    expect(computeGroupInsertIndex(midpoints, 150, 0)).toBeNull();
    // Crossing midpoint of index 1 inserts before index 2; past last inserts at end.
    expect(computeGroupInsertIndex(midpoints, 250, 0)).toBe(2);
    expect(computeGroupInsertIndex(midpoints, 350, 0)).toBe(3);

    // Dragging index 2 upward above index 0 midpoint inserts at 0.
    expect(computeGroupInsertIndex(midpoints, 50, 2)).toBe(0);
    expect(computeGroupInsertIndex(midpoints, 150, 2)).toBe(1);
    expect(computeGroupInsertIndex(midpoints, 250, 2)).toBeNull();
  });

  it("reorders groups forward and backward cleanly", () => {
    const groups = ["Default", "Prod", "Staging"];
    expect(applyGroupReorder(groups, 0, 2)).toEqual(["Prod", "Default", "Staging"]);
    expect(applyGroupReorder(groups, 0, 3)).toEqual(["Prod", "Staging", "Default"]);
    expect(applyGroupReorder(groups, 2, 0)).toEqual(["Staging", "Default", "Prod"]);
    expect(applyGroupReorder(groups, 2, 1)).toEqual(["Default", "Staging", "Prod"]);
  });
});
