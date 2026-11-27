import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/shared/i18n";
import { TabItem } from "@/modules/workspace/components/TabItem";
import type { TerminalTabItem } from "@/shared/types/ipc";
import {
  Button,
  IconButton,
  Tooltip,
  TooltipProvider,
  computeTooltipPosition,
  createTooltipRegistry,
  isTooltipAnchorAllowed,
  sanitizeTooltipText,
} from "../index";

describe("Custom Tooltip System", () => {
  describe("computeTooltipPosition", () => {
    const viewport = { width: 1200, height: 800 };

    it("prefers bottom placement for top-bar anchors (e.g. TabBar / WindowCaptionControls)", () => {
      const pos = computeTooltipPosition(
        { left: 100, top: 4, right: 280, bottom: 36, width: 180, height: 32 },
        { width: 220, height: 76 },
        viewport,
        "auto"
      );
      expect(pos.side).toBe("bottom");
      expect(pos.top).toBe(43);
      expect(pos.left).toBe(80);
    });

    it("prefers top placement for mid/bottom anchors when sufficient space exists above", () => {
      const pos = computeTooltipPosition(
        { left: 500, top: 760, right: 560, bottom: 788, width: 60, height: 28 },
        { width: 140, height: 32 },
        viewport,
        "auto"
      );
      expect(pos.side).toBe("top");
      expect(pos.top).toBe(721);
      expect(pos.left).toBe(460);
    });

    it("flips bottom -> top and top -> bottom when preferred side overflows viewport", () => {
      const flippedTop = computeTooltipPosition(
        { left: 400, top: 755, right: 480, bottom: 785, width: 80, height: 30 },
        { width: 160, height: 48 },
        viewport,
        "bottom"
      );
      expect(flippedTop.side).toBe("top");

      const flippedBottom = computeTooltipPosition(
        { left: 400, top: 10, right: 480, bottom: 38, width: 80, height: 28 },
        { width: 160, height: 48 },
        viewport,
        "top"
      );
      expect(flippedBottom.side).toBe("bottom");
    });

    it("clamps horizontal coordinates within edge padding near window corners", () => {
      const nearRightEdge = computeTooltipPosition(
        { left: 1156, top: 0, right: 1200, bottom: 36, width: 44, height: 36 },
        { width: 150, height: 30 },
        viewport,
        "bottom"
      );
      expect(nearRightEdge.left).toBe(1200 - 150 - 8);

      const nearLeftEdge = computeTooltipPosition(
        { left: 2, top: 0, right: 30, bottom: 36, width: 28, height: 36 },
        { width: 150, height: 30 },
        viewport,
        "bottom"
      );
      expect(nearLeftEdge.left).toBe(8);
    });
  });

  describe("Component rendering & slot integration", () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("maps title prop to data-tooltip without emitting native title on IconButton and Button", () => {
      const iconHtml = renderToStaticMarkup(
        React.createElement(IconButton, { title: "Save (Ctrl+S)" })
      );
      expect(iconHtml).toContain('data-tooltip="Save (Ctrl+S)"');
      expect(iconHtml).toContain('aria-label="Save (Ctrl+S)"');
      expect(iconHtml).not.toContain(' title="');

      const btnHtml = renderToStaticMarkup(
        React.createElement(Button, { title: "Upload files" }, "Upload")
      );
      expect(btnHtml).toContain('data-tooltip="Upload files"');
      expect(btnHtml).not.toContain(' title="');
    });

    it("attaches data-tooltip-id via Tooltip without extra wrapper elements", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(Tooltip, {
            content: React.createElement("strong", null, "Host Card"),
            variant: "card",
            children: React.createElement("div", { className: "tab-anchor" }, "Prod"),
          })
        )
      );
      expect(html).toContain('class="tab-anchor"');
      expect(html).toContain("data-tooltip-id=");
    });

    it("registers rich card slot on SSH/SFTP TabItem and plain data-tooltip on Local TabItem", () => {
      const noop = () => {};
      const sshTab: TerminalTabItem = {
        tabId: "t-ssh",
        hostId: "host-1",
        title: "Prod Server",
        hostSubtitle: "ubuntu@10.0.0.8:22",
        state: "ONLINE",
        reconnectToken: 0,
      };
      const localTab: TerminalTabItem = {
        tabId: "t-local",
        hostId: "local",
        title: "PowerShell",
        hostSubtitle: "Local",
        state: "ONLINE",
        reconnectToken: 0,
      };

      const sshHtml = renderToStaticMarkup(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(
            TooltipProvider,
            null,
            React.createElement(TabItem, {
              tab: sshTab,
              isActive: true,
              isDragged: false,
              isCompact: false,
              elRef: noop,
              onPointerDown: noop,
              onSelect: noop,
              onClose: noop,
              onReconnect: noop,
              onContextMenu: noop,
            })
          )
        )
      );
      expect(sshHtml).toContain("data-tooltip-id=");
      expect(sshHtml).not.toContain(' title="');

      const localHtml = renderToStaticMarkup(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(
            TooltipProvider,
            null,
            React.createElement(TabItem, {
              tab: localTab,
              isActive: false,
              isDragged: false,
              isCompact: false,
              elRef: noop,
              onPointerDown: noop,
              onSelect: noop,
              onClose: noop,
              onReconnect: noop,
              onContextMenu: noop,
            })
          )
        )
      );
      expect(localHtml).toContain('data-tooltip="PowerShell"');
      expect(localHtml).not.toContain(' title="');
    });

    it("deduplicates identical slot upserts in TooltipRegistry to prevent feedback loops", () => {
      const registry = createTooltipRegistry();
      const events: string[] = [];
      const unsub = registry.subscribe((id) => events.push(id));

      const node = React.createElement("div", null, "SSH Card");
      registry.upsertSlot("slot-1", {
        content: node,
        placement: "bottom",
        variant: "card",
        disabled: false,
      });
      // Identical upsert must be a no-op without notifying subscribers
      registry.upsertSlot("slot-1", {
        content: node,
        placement: "bottom",
        variant: "card",
        disabled: false,
      });
      expect(events).toEqual(["slot-1"]);

      registry.removeSlot("slot-1");
      registry.removeSlot("slot-1");
      expect(events).toEqual(["slot-1", "slot-1"]);
      unsub();
    });

    it("strips Unicode BiDi override/isolate control characters from tooltip strings", () => {
      const spoofed = "/tmp/\u202Etxt.exe -> /var/www/\u2066index.html\u2069";
      expect(sanitizeTooltipText(spoofed)).toBe("/tmp/txt.exe -> /var/www/index.html");
    });

    it("rejects detached, disabled, or [inert] anchors in isTooltipAnchorAllowed", () => {
      const fakeDetached = {
        isConnected: false,
        disabled: false,
        getAttribute: () => null,
        closest: () => null,
        ownerDocument: null,
      } as unknown as HTMLElement;
      expect(isTooltipAnchorAllowed(fakeDetached)).toBe(false);

      const fakeInert = {
        isConnected: true,
        disabled: false,
        getAttribute: () => null,
        closest: (sel: string) => (sel === "[inert]" ? ({} as Element) : null),
        ownerDocument: null,
      } as unknown as HTMLElement;
      expect(isTooltipAnchorAllowed(fakeInert)).toBe(false);

      const fakeValid = {
        isConnected: true,
        disabled: false,
        getAttribute: () => null,
        closest: () => null,
        ownerDocument: null,
      } as unknown as HTMLElement;
      expect(isTooltipAnchorAllowed(fakeValid)).toBe(true);
    });
  });
});
