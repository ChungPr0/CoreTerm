import type { IBufferRange, ILink, ILinkHandler, ILinkProvider, Terminal } from "@xterm/xterm";
import { TERM_PASTE_WARN_BYTES } from "@/shared/defaults";
import type { WarnPasteMultilineMode } from "@/modules/settings";

export interface TerminalPastePlan {
  text: string;
  byteLength: number;
  lineCount: number;
  warnLarge: boolean;
  warnMultiline: boolean;
  warnUnsafeChars: boolean;
  needsConfirmation: boolean;
  preview: string;
}

export interface EvaluateTerminalPasteOpts {
  trimWhitespace: boolean;
  warnLarge: boolean;
  warnMultiline: WarnPasteMultilineMode;
  bracketedPasteActive: boolean;
}

export interface DetectedHttpUrl {
  url: string;
  startIndex: number;
  endIndex: number;
}

const PASTE_PREVIEW_MAX_LINES = 50;
const PASTE_PREVIEW_MAX_CHARS = 4096;
const MAX_WRAPPED_SCAN_LINES = 6;
const HTTP_URL_RE = /https?:\/\/[^\s<>"'`\x00-\x1f\x7f]+/gi;
const UNSAFE_PASTE_CHARS_RE =
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const BRACKETED_PASTE_MARKER_RE = /(?:\x1b\[|\x9b)20[01]~/g;
const STRIP_CONTROL_OR_BIDI_RE =
  /[\x00-\x08\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g;
const ALT_LINE_BREAK_RE = /[\x0b\x0c\u2028\u2029]/g;
const TRAILING_PUNCT_CHARS = new Set([".", ",", ";", ":", "!", "?"]);
const CLOSING_TO_OPENING: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

/** Removes trailing spaces and horizontal tabs per line while preserving line breaks. */
export function trimTerminalPasteText(text: string): string {
  return text.replace(/[ \t]+(\r?\n)/g, "$1").replace(/[ \t]+$/, "");
}

/** Neutralizes bracketed-paste breakout markers, C0/C1 control bytes, and Bidi overrides. */
export function sanitizeTerminalPasteText(text: string): string {
  return text
    .replace(BRACKETED_PASTE_MARKER_RE, "")
    .replace(/\x85/g, "\n")
    .replace(ALT_LINE_BREAK_RE, "\n")
    .replace(STRIP_CONTROL_OR_BIDI_RE, "");
}

function formatVisiblePreviewChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code === 0x1b) return "\\x1b";
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
    return `\\x${code.toString(16).padStart(2, "0")}`;
  }
  return `\\u${code.toString(16).padStart(4, "0")}`;
}

function buildPastePreview(rawText: string): string {
  const visible = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      formatVisiblePreviewChar
    );
  const lines = visible.split("\n");
  const slicedLines = lines.slice(0, PASTE_PREVIEW_MAX_LINES);
  let out = slicedLines.join("\n");
  let truncated = lines.length > PASTE_PREVIEW_MAX_LINES;
  if (out.length > PASTE_PREVIEW_MAX_CHARS) {
    out = out.slice(0, PASTE_PREVIEW_MAX_CHARS);
    truncated = true;
  }
  return truncated ? `${out}…` : out;
}

/** Applies configured paste transformations and determines whether confirmation is required. */
export function evaluateTerminalPaste(
  rawText: string,
  opts: EvaluateTerminalPasteOpts
): TerminalPastePlan {
  if (!rawText) {
    return {
      text: "",
      byteLength: 0,
      lineCount: 0,
      warnLarge: false,
      warnMultiline: false,
      warnUnsafeChars: false,
      needsConfirmation: false,
      preview: "",
    };
  }

  const warnUnsafeChars = UNSAFE_PASTE_CHARS_RE.test(rawText);
  const sanitized = sanitizeTerminalPasteText(rawText);
  const text = opts.trimWhitespace ? trimTerminalPasteText(sanitized) : sanitized;
  if (!text) {
    return {
      text: "",
      byteLength: 0,
      lineCount: 0,
      warnLarge: false,
      warnMultiline: false,
      warnUnsafeChars: false,
      needsConfirmation: false,
      preview: "",
    };
  }

  const byteLength = new TextEncoder().encode(text).byteLength;
  const hasNewline = /\r|\n/.test(text);
  const lineCount = text.split(/\r\n|\r|\n/).length;
  const warnLarge = opts.warnLarge && byteLength > TERM_PASTE_WARN_BYTES;
  const warnMultiline =
    hasNewline &&
    (opts.warnMultiline === "always" ||
      (opts.warnMultiline === "bracketed_disabled" && !opts.bracketedPasteActive));
  const needsConfirmation = warnLarge || warnMultiline || warnUnsafeChars;

  return {
    text,
    byteLength,
    lineCount,
    warnLarge,
    warnMultiline,
    warnUnsafeChars,
    needsConfirmation,
    preview: needsConfirmation ? buildPastePreview(warnUnsafeChars ? rawText : text) : "",
  };
}

/** Normalizes a candidate string into a canonical Punycode http(s) URL, or null if unsafe. */
export function normalizeSafeHttpUrl(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if (/[\x00-\x20\x7f"\\]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname
    ) {
      return null;
    }
    const href = parsed.href;
    if (
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      !trimmed.endsWith("/")
    ) {
      return href.slice(0, -1);
    }
    return href;
  } catch {
    return null;
  }
}

/** Validates that a candidate string is a well-formed http(s) URL safe to open externally. */
export function isSafeHttpUrl(candidate: string): boolean {
  return normalizeSafeHttpUrl(candidate) !== null;
}

function countChar(str: string, target: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === target) count++;
  }
  return count;
}

function stripUnbalancedTrailingPunctuation(raw: string): string {
  let end = raw.length;
  while (end > 0) {
    const ch = raw[end - 1];
    if (TRAILING_PUNCT_CHARS.has(ch)) {
      end--;
      continue;
    }
    const openCh = CLOSING_TO_OPENING[ch];
    if (openCh) {
      const slice = raw.slice(0, end);
      if (countChar(slice, ch) > countChar(slice, openCh)) {
        end--;
        continue;
      }
    }
    break;
  }
  return raw.slice(0, end);
}

/** Extracts safe http(s) URLs with exact 0-based character offsets from a single logical line. */
export function extractHttpUrlsFromText(text: string): DetectedHttpUrl[] {
  if (!text || (!text.includes("http://") && !text.includes("https://") && !/https?:\/\//i.test(text))) {
    return [];
  }
  const results: DetectedHttpUrl[] = [];
  HTTP_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTTP_URL_RE.exec(text)) !== null) {
    const cleaned = stripUnbalancedTrailingPunctuation(match[0]);
    const normalized = normalizeSafeHttpUrl(cleaned);
    if (!normalized) continue;
    results.push({
      url: normalized,
      startIndex: match.index,
      endIndex: match.index + cleaned.length,
    });
  }
  return results;
}

function isCtrlActivation(event: MouseEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

/** Creates an xterm.js ILinkProvider supporting wrapped lines and Ctrl+Click activation. */
export function createTerminalUrlLinkProvider(
  term: Terminal,
  opts: {
    onOpenUrl: (url: string) => void;
    onHoverChange?: (url: string | null) => void;
  }
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void) {
      const buffer = term.buffer.active;
      const targetIdx = bufferLineNumber - 1;
      const targetLine = buffer.getLine(targetIdx);
      if (!targetLine) {
        callback(undefined);
        return;
      }

      let startIdx = targetIdx;
      while (
        startIdx > 0 &&
        targetIdx - startIdx < MAX_WRAPPED_SCAN_LINES &&
        buffer.getLine(startIdx)?.isWrapped
      ) {
        startIdx--;
      }

      let endIdx = targetIdx;
      while (
        endIdx + 1 < buffer.length &&
        endIdx - targetIdx < MAX_WRAPPED_SCAN_LINES &&
        buffer.getLine(endIdx + 1)?.isWrapped
      ) {
        endIdx++;
      }

      const segments: Array<{ lineIdx: number; text: string; startOffset: number }> = [];
      let combined = "";
      for (let i = startIdx; i <= endIdx; i++) {
        const line = buffer.getLine(i);
        if (!line) break;
        const isLast = i === endIdx;
        const segText = line.translateToString(isLast);
        segments.push({ lineIdx: i, text: segText, startOffset: combined.length });
        combined += segText;
      }

      const detected = extractHttpUrlsFromText(combined);
      if (detected.length === 0) {
        callback(undefined);
        return;
      }

      const mapOffsetToPos = (offset: number, inclusiveEnd: boolean) => {
        const targetOffset = inclusiveEnd ? Math.max(0, offset - 1) : offset;
        for (let s = segments.length - 1; s >= 0; s--) {
          const seg = segments[s];
          if (targetOffset >= seg.startOffset) {
            const col0 = targetOffset - seg.startOffset;
            return {
              x: col0 + 1,
              y: seg.lineIdx + 1,
            };
          }
        }
        return { x: 1, y: startIdx + 1 };
      };

      const links: ILink[] = [];
      for (const item of detected) {
        const startPos = mapOffsetToPos(item.startIndex, false);
        const endPos = mapOffsetToPos(item.endIndex, true);
        if (bufferLineNumber < startPos.y || bufferLineNumber > endPos.y) {
          continue;
        }
        const range: IBufferRange = { start: startPos, end: endPos };
        links.push({
          range,
          text: item.url,
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate: (event, urlText) => {
            if (!isCtrlActivation(event)) return;
            const safeUrl = normalizeSafeHttpUrl(urlText);
            if (safeUrl) {
              opts.onOpenUrl(safeUrl);
            }
          },
          hover: (_event, urlText) => {
            const safeUrl = normalizeSafeHttpUrl(urlText);
            if (safeUrl) opts.onHoverChange?.(safeUrl);
          },
          leave: () => {
            opts.onHoverChange?.(null);
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}

/** Creates an OSC 8 hyperlink handler respecting the URL detection setting and Ctrl+Click. */
export function createOsc8LinkHandler(opts: {
  enabled: () => boolean;
  onOpenUrl: (url: string) => void;
  onHoverChange?: (url: string | null) => void;
}): ILinkHandler {
  return {
    allowNonHttpProtocols: false,
    activate: (event, text) => {
      if (!opts.enabled() || !isCtrlActivation(event)) return;
      const safeUrl = normalizeSafeHttpUrl(text);
      if (safeUrl) {
        opts.onOpenUrl(safeUrl);
      }
    },
    hover: (_event, text) => {
      if (!opts.enabled()) return;
      const safeUrl = normalizeSafeHttpUrl(text);
      if (!safeUrl) return;
      opts.onHoverChange?.(safeUrl);
    },
    leave: () => {
      opts.onHoverChange?.(null);
    },
  };
}
