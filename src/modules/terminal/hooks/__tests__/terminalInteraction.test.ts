import { describe, expect, it, vi } from "vitest";
import type { ILink, Terminal } from "@xterm/xterm";
import { TERM_PASTE_WARN_BYTES } from "@/shared/defaults";
import {
  createOsc8LinkHandler,
  createTerminalUrlLinkProvider,
  evaluateTerminalPaste,
  extractHttpUrlsFromText,
  isSafeHttpUrl,
  normalizeSafeHttpUrl,
  sanitizeTerminalPasteText,
  trimTerminalPasteText,
} from "../terminalInteraction";

describe("terminalInteraction", () => {
  describe("trimTerminalPasteText", () => {
    it("strips trailing spaces and tabs per line while preserving newlines", () => {
      expect(trimTerminalPasteText("echo hello   \t")).toBe("echo hello");
      expect(trimTerminalPasteText("line1   \nline2\t\t\r\nline3  ")).toBe(
        "line1\nline2\r\nline3"
      );
      expect(trimTerminalPasteText("ls -la   \n")).toBe("ls -la\n");
      expect(trimTerminalPasteText("   \t  ")).toBe("");
    });
  });

  describe("evaluateTerminalPaste", () => {
    it("allows short single-line paste without confirmation", () => {
      const plan = evaluateTerminalPaste("ssh root@10.0.0.1   ", {
        trimWhitespace: true,
        warnLarge: true,
        warnMultiline: "bracketed_disabled",
        bracketedPasteActive: false,
      });
      expect(plan.text).toBe("ssh root@10.0.0.1");
      expect(plan.needsConfirmation).toBe(false);
      expect(plan.warnLarge).toBe(false);
      expect(plan.warnMultiline).toBe(false);
    });

    it("warns on newlines only when bracketed paste is disabled in bracketed_disabled mode", () => {
      const unsafePlan = evaluateTerminalPaste("sudo apt update\nsudo apt upgrade", {
        trimWhitespace: true,
        warnLarge: true,
        warnMultiline: "bracketed_disabled",
        bracketedPasteActive: false,
      });
      expect(unsafePlan.needsConfirmation).toBe(true);
      expect(unsafePlan.warnMultiline).toBe(true);
      expect(unsafePlan.lineCount).toBe(2);

      const safeBracketedPlan = evaluateTerminalPaste(
        "sudo apt update\nsudo apt upgrade",
        {
          trimWhitespace: true,
          warnLarge: true,
          warnMultiline: "bracketed_disabled",
          bracketedPasteActive: true,
        }
      );
      expect(safeBracketedPlan.needsConfirmation).toBe(false);
      expect(safeBracketedPlan.warnMultiline).toBe(false);
    });

    it("respects 'always' and 'never' multiline warning modes", () => {
      const alwaysPlan = evaluateTerminalPaste("echo 1\necho 2", {
        trimWhitespace: false,
        warnLarge: false,
        warnMultiline: "always",
        bracketedPasteActive: true,
      });
      expect(alwaysPlan.warnMultiline).toBe(true);
      expect(alwaysPlan.needsConfirmation).toBe(true);

      const neverPlan = evaluateTerminalPaste("echo 1\necho 2", {
        trimWhitespace: false,
        warnLarge: false,
        warnMultiline: "never",
        bracketedPasteActive: false,
      });
      expect(neverPlan.warnMultiline).toBe(false);
      expect(neverPlan.needsConfirmation).toBe(false);
    });

    it("warns when UTF-8 payload exceeds 5 KiB and truncates preview cleanly", () => {
      const hugePayload = "A".repeat(TERM_PASTE_WARN_BYTES + 10);
      const plan = evaluateTerminalPaste(hugePayload, {
        trimWhitespace: true,
        warnLarge: true,
        warnMultiline: "never",
        bracketedPasteActive: true,
      });
      expect(plan.warnLarge).toBe(true);
      expect(plan.needsConfirmation).toBe(true);
      expect(plan.preview.endsWith("…")).toBe(true);
      expect(plan.preview.length).toBeLessThanOrEqual(4097);

      const disabledLargeWarn = evaluateTerminalPaste(hugePayload, {
        trimWhitespace: true,
        warnLarge: false,
        warnMultiline: "never",
        bracketedPasteActive: true,
      });
      expect(disabledLargeWarn.needsConfirmation).toBe(false);
    });

    it("neutralizes bracketed-paste breakouts, C0/C1 controls, and Bidi overrides while forcing confirmation", () => {
      const breakoutPlan = evaluateTerminalPaste("echo safe\x1b[201~\ncurl evil.sh\r", {
        trimWhitespace: true,
        warnLarge: false,
        warnMultiline: "bracketed_disabled",
        bracketedPasteActive: true,
      });
      expect(breakoutPlan.warnUnsafeChars).toBe(true);
      expect(breakoutPlan.needsConfirmation).toBe(true);
      expect(breakoutPlan.text).toBe("echo safe\ncurl evil.sh\r");
      expect(breakoutPlan.text).not.toContain("\x1b");
      expect(breakoutPlan.text).not.toContain("201~");
      expect(breakoutPlan.preview).toContain("\\x1b[201~");

      const c1AndBidiPlan = evaluateTerminalPaste("echo \x9b201~\u202eevil", {
        trimWhitespace: true,
        warnLarge: false,
        warnMultiline: "never",
        bracketedPasteActive: true,
      });
      expect(c1AndBidiPlan.warnUnsafeChars).toBe(true);
      expect(c1AndBidiPlan.needsConfirmation).toBe(true);
      expect(c1AndBidiPlan.text).toBe("echo evil");
      expect(c1AndBidiPlan.preview).toContain("\\x9b201~");
      expect(c1AndBidiPlan.preview).toContain("\\u202e");

      expect(sanitizeTerminalPasteText("a\x85b\u2028c\x0bd")).toBe("a\nb\nc\nd");
    });
  });

  describe("URL detection & link provider", () => {
    it("validates strict http/https URLs and rejects unsafe schemes", () => {
      expect(isSafeHttpUrl("https://coreterm.dev/docs?v=1")).toBe(true);
      expect(isSafeHttpUrl("http://127.0.0.1:8080/health")).toBe(true);
      expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeHttpUrl("file:///C:/Windows/win.ini")).toBe(false);
      expect(isSafeHttpUrl("https://bad url.example.com")).toBe(false);
      expect(isSafeHttpUrl('https://example.com/"evil')).toBe(false);
      expect(isSafeHttpUrl("https://example.com\\evil")).toBe(false);
    });

    it("normalizes IDN homograph domains to Punycode across detector and OSC 8 handler", () => {
      // Cyrillic 'а' (U+0430) in "аpple.com"
      const homograph = "https://\u0430pple.com";
      expect(normalizeSafeHttpUrl(homograph)).toBe("https://xn--pple-43d.com");
      expect(normalizeSafeHttpUrl(`${homograph}/login`)).toBe("https://xn--pple-43d.com/login");

      const found = extractHttpUrlsFromText(`Visit ${homograph}/auth.`);
      expect(found.map((item) => item.url)).toEqual(["https://xn--pple-43d.com/auth"]);

      const onOpenUrl = vi.fn();
      const handler = createOsc8LinkHandler({
        enabled: () => true,
        onOpenUrl,
      });
      handler.activate(
        { ctrlKey: true, metaKey: false, altKey: false } as MouseEvent,
        homograph,
        { start: { x: 1, y: 1 }, end: { x: 10, y: 1 } }
      );
      expect(onOpenUrl).toHaveBeenCalledWith("https://xn--pple-43d.com");
    });

    it("extracts URLs while stripping unbalanced trailing punctuation and keeping balanced parens", () => {
      const sample =
        "Visit (https://example.com/api/v1), https://en.wikipedia.org/wiki/SSH_(Secure_Shell).";
      const found = extractHttpUrlsFromText(sample);
      expect(found.map((item) => item.url)).toEqual([
        "https://example.com/api/v1",
        "https://en.wikipedia.org/wiki/SSH_(Secure_Shell)",
      ]);
    });

    it("provides wrapped multi-line links and requires Ctrl/Meta+Click to open", () => {
      const lines = [
        { text: "Open https://localhost:5173/auth/ca", isWrapped: false },
        { text: "llback?code=abc123 now", isWrapped: true },
      ];
      const mockTerm = {
        buffer: {
          active: {
            length: lines.length,
            getLine: (idx: number) => {
              const entry = lines[idx];
              if (!entry) return undefined;
              return {
                isWrapped: entry.isWrapped,
                translateToString: () => entry.text,
              };
            },
          },
        },
      } as unknown as Terminal;

      const onOpenUrl = vi.fn();
      const onHoverChange = vi.fn();
      const provider = createTerminalUrlLinkProvider(mockTerm, {
        onOpenUrl,
        onHoverChange,
      });

      let detectedLinks: ILink[] | undefined;
      provider.provideLinks(1, (links) => {
        detectedLinks = links;
      });

      expect(detectedLinks).toHaveLength(1);
      const link = detectedLinks![0];
      expect(link.text).toBe("https://localhost:5173/auth/callback?code=abc123");
      expect(link.range).toEqual({
        start: { x: 6, y: 1 },
        end: { x: 18, y: 2 },
      });

      // Plain click must NOT open browser
      link.activate({ ctrlKey: false, metaKey: false, altKey: false } as MouseEvent, link.text);
      expect(onOpenUrl).not.toHaveBeenCalled();

      // Ctrl+Click opens URL
      link.activate({ ctrlKey: true, metaKey: false, altKey: false } as MouseEvent, link.text);
      expect(onOpenUrl).toHaveBeenCalledWith(
        "https://localhost:5173/auth/callback?code=abc123"
      );

      link.hover?.({} as MouseEvent, link.text);
      expect(onHoverChange).toHaveBeenCalledWith(link.text);
      link.leave?.({} as MouseEvent, link.text);
      expect(onHoverChange).toHaveBeenCalledWith(null);
    });

    it("gates OSC 8 links behind enabled flag and Ctrl+Click", () => {
      let enabled = false;
      const onOpenUrl = vi.fn();
      const handler = createOsc8LinkHandler({
        enabled: () => enabled,
        onOpenUrl,
      });

      handler.activate(
        { ctrlKey: true, metaKey: false, altKey: false } as MouseEvent,
        "https://example.com",
        { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } }
      );
      expect(onOpenUrl).not.toHaveBeenCalled();

      enabled = true;
      handler.activate(
        { ctrlKey: true, metaKey: false, altKey: false } as MouseEvent,
        "javascript:evil()",
        { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } }
      );
      expect(onOpenUrl).not.toHaveBeenCalled();

      handler.activate(
        { ctrlKey: true, metaKey: false, altKey: false } as MouseEvent,
        "https://example.com",
        { start: { x: 1, y: 1 }, end: { x: 5, y: 1 } }
      );
      expect(onOpenUrl).toHaveBeenCalledWith("https://example.com");
    });
  });
});
