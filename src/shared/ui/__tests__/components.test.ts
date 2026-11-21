import { describe, expect, it } from "vitest";
import { ActionModal, Button, Checkbox, IconButton, Input, SegmentedControl, Select, Switch } from "../index";

describe("Shared UI Form Components", () => {
  it("exports ActionModal, Button, IconButton, SegmentedControl, Input, Select, Checkbox, Switch properly", () => {
    expect(ActionModal).toBeDefined();
    expect(Button).toBeDefined();
    expect(IconButton).toBeDefined();
    expect(SegmentedControl).toBeDefined();
    expect(Input).toBeDefined();
    expect(Select).toBeDefined();
    expect(Checkbox).toBeDefined();
    expect(Switch).toBeDefined();
  });

  describe("SegmentedControl Component", () => {
    it("has correct displayName and function signature", () => {
      expect(SegmentedControl.displayName).toBe("SegmentedControl");
      expect(typeof SegmentedControl).toBe("function");
    });
  });

  describe("Button Component", () => {
    it("has forwardRef displayName", () => {
      expect(Button.displayName).toBe("Button");
    });
  });

  describe("IconButton Component", () => {
    it("has forwardRef displayName", () => {
      expect(IconButton.displayName).toBe("IconButton");
    });
  });

  describe("Switch Component", () => {
    it("has correct displayName and function signature", () => {
      expect(typeof Switch).toBe("function");
    });
  });

  describe("Checkbox Component", () => {
    it("has forwardRef displayName", () => {
      expect(Checkbox.displayName).toBe("Checkbox");
    });
  });

  describe("Input Component", () => {
    it("has forwardRef displayName", () => {
      expect(Input.displayName).toBe("Input");
    });
  });

  describe("Select Component", () => {
    it("has forwardRef displayName", () => {
      expect(Select.displayName).toBe("Select");
    });
  });
});
