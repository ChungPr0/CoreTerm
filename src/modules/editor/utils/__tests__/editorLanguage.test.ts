import { describe, expect, it } from "vitest";
import {
  convertLineEnding,
  detectEditorLanguage,
  detectLineEnding,
  normalizeToLf,
} from "../editorLanguage";

describe("editorLanguage utils", () => {
  it("detects common server config and script languages by filename and extension", () => {
    expect(detectEditorLanguage("Dockerfile").id).toBe("dockerfile");
    expect(detectEditorLanguage("Dockerfile.prod").id).toBe("dockerfile");
    expect(detectEditorLanguage("nginx.conf").id).toBe("nginx");
    expect(detectEditorLanguage(".bashrc").id).toBe("shell");
    expect(detectEditorLanguage("deploy.sh").id).toBe("shell");
    expect(detectEditorLanguage(".env.production").id).toBe("properties");
    expect(detectEditorLanguage("docker-compose.yml").id).toBe("yaml");
    expect(detectEditorLanguage("package.json").id).toBe("json");
    expect(detectEditorLanguage("app.py").id).toBe("python");
    expect(detectEditorLanguage("index.tsx").id).toBe("tsx");
    expect(detectEditorLanguage("init.sql").id).toBe("sql");
    expect(detectEditorLanguage("coreterm.service").id).toBe("properties");
    expect(detectEditorLanguage("README.md").id).toBe("markdown");
    expect(detectEditorLanguage("notes").id).toBe("plain");
  });

  it("detects and converts LF / CRLF line endings accurately", () => {
    expect(detectLineEnding("a\nb\nc\n")).toBe("LF");
    expect(detectLineEnding("a\r\nb\r\nc\r\n")).toBe("CRLF");
    expect(detectLineEnding("single line")).toBe("LF");

    expect(normalizeToLf("a\r\nb\nc")).toBe("a\nb\nc");
    expect(convertLineEnding("a\nb\nc", "CRLF")).toBe("a\r\nb\r\nc");
    expect(convertLineEnding("a\r\nb\r\nc", "LF")).toBe("a\nb\nc");
  });
});
