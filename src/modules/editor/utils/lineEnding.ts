import type { EditorLineEnding } from "../types";

export type { EditorLineEnding };

export function detectLineEnding(content: string): EditorLineEnding {
  let crlf = 0;
  let lfOnly = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      if (i > 0 && content.charCodeAt(i - 1) === 13) crlf++;
      else lfOnly++;
    }
  }
  return crlf > 0 && crlf >= lfOnly ? "CRLF" : "LF";
}

export function normalizeToLf(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

export function convertLineEnding(content: string, eol: EditorLineEnding): string {
  const lf = normalizeToLf(content);
  return eol === "CRLF" ? lf.replace(/\n/g, "\r\n") : lf;
}
