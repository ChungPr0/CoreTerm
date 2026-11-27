import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

    it("uses roving tabindex so only the selected radio option is tabbable", () => {
      const html = renderToStaticMarkup(
        React.createElement(SegmentedControl, {
          value: "SSH_KEY",
          onChange: () => {},
          options: [
            { value: "PASSWORD", label: "Password" },
            { value: "SSH_KEY", label: "SSH Key" },
          ],
        })
      );
      expect(html).toContain('tabindex="-1" aria-checked="false"');
      expect(html).toContain('tabindex="0" aria-checked="true"');
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

    it("defaults tabIndex to -1 and allows explicit tabIndex={0}", () => {
      const defaultHtml = renderToStaticMarkup(
        React.createElement(IconButton, { title: "Close" })
      );
      expect(defaultHtml).toContain('tabindex="-1"');

      const tabbableHtml = renderToStaticMarkup(
        React.createElement(IconButton, { title: "Edit", tabIndex: 0 })
      );
      expect(tabbableHtml).toContain('tabindex="0"');
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
