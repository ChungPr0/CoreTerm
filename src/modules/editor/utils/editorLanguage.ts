import type { Extension } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";

export {
  convertLineEnding,
  detectLineEnding,
  normalizeToLf,
  type EditorLineEnding,
} from "./lineEnding";

export interface EditorLanguageSpec {
  id: string;
  label: string;
  loadExtension: () => Promise<Extension | null>;
}

const PLAIN_SPEC: EditorLanguageSpec = {
  id: "plain",
  label: "Plain Text",
  loadExtension: async () => null,
};

export const EDITOR_LANGUAGES: EditorLanguageSpec[] = [
  PLAIN_SPEC,
  {
    id: "shell",
    label: "Shell / Bash",
    loadExtension: async () => {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return StreamLanguage.define(shell);
    },
  },
  {
    id: "properties",
    label: "Config / INI / Env",
    loadExtension: async () => {
      const { properties } = await import("@codemirror/legacy-modes/mode/properties");
      return StreamLanguage.define(properties);
    },
  },
  {
    id: "nginx",
    label: "Nginx",
    loadExtension: async () => {
      const { nginx } = await import("@codemirror/legacy-modes/mode/nginx");
      return StreamLanguage.define(nginx);
    },
  },
  {
    id: "dockerfile",
    label: "Dockerfile",
    loadExtension: async () => {
      const { dockerFile } = await import("@codemirror/legacy-modes/mode/dockerfile");
      return StreamLanguage.define(dockerFile);
    },
  },
  {
    id: "yaml",
    label: "YAML",
    loadExtension: async () => (await import("@codemirror/lang-yaml")).yaml(),
  },
  {
    id: "json",
    label: "JSON",
    loadExtension: async () => (await import("@codemirror/lang-json")).json(),
  },
  {
    id: "toml",
    label: "TOML",
    loadExtension: async () => {
      const { toml } = await import("@codemirror/legacy-modes/mode/toml");
      return StreamLanguage.define(toml);
    },
  },
  {
    id: "javascript",
    label: "JavaScript",
    loadExtension: async () => (await import("@codemirror/lang-javascript")).javascript(),
  },
  {
    id: "jsx",
    label: "JSX",
    loadExtension: async () =>
      (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  },
  {
    id: "typescript",
    label: "TypeScript",
    loadExtension: async () =>
      (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  },
  {
    id: "tsx",
    label: "TSX",
    loadExtension: async () =>
      (await import("@codemirror/lang-javascript")).javascript({
        typescript: true,
        jsx: true,
      }),
  },
  {
    id: "python",
    label: "Python",
    loadExtension: async () => (await import("@codemirror/lang-python")).python(),
  },
  {
    id: "sql",
    label: "SQL",
    loadExtension: async () => (await import("@codemirror/lang-sql")).sql(),
  },
  {
    id: "html",
    label: "HTML",
    loadExtension: async () => (await import("@codemirror/lang-html")).html(),
  },
  {
    id: "css",
    label: "CSS",
    loadExtension: async () => (await import("@codemirror/lang-css")).css(),
  },
  {
    id: "xml",
    label: "XML",
    loadExtension: async () => (await import("@codemirror/lang-xml")).xml(),
  },
  {
    id: "markdown",
    label: "Markdown",
    loadExtension: async () => (await import("@codemirror/lang-markdown")).markdown(),
  },
  {
    id: "powershell",
    label: "PowerShell",
    loadExtension: async () => {
      const { powerShell } = await import("@codemirror/legacy-modes/mode/powershell");
      return StreamLanguage.define(powerShell);
    },
  },
  {
    id: "go",
    label: "Go",
    loadExtension: async () => {
      const { go } = await import("@codemirror/legacy-modes/mode/go");
      return StreamLanguage.define(go);
    },
  },
  {
    id: "rust",
    label: "Rust",
    loadExtension: async () => {
      const { rust } = await import("@codemirror/legacy-modes/mode/rust");
      return StreamLanguage.define(rust);
    },
  },
  {
    id: "ruby",
    label: "Ruby",
    loadExtension: async () => {
      const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
      return StreamLanguage.define(ruby);
    },
  },
  {
    id: "lua",
    label: "Lua",
    loadExtension: async () => {
      const { lua } = await import("@codemirror/legacy-modes/mode/lua");
      return StreamLanguage.define(lua);
    },
  },
];

const LANG_BY_ID = new Map<string, EditorLanguageSpec>(
  EDITOR_LANGUAGES.map((spec) => [spec.id, spec])
);

export function getEditorLanguageById(id: string): EditorLanguageSpec {
  return LANG_BY_ID.get(id) ?? PLAIN_SPEC;
}

export function detectEditorLanguage(fileName: string): EditorLanguageSpec {
  const base = fileName.trim().toLowerCase();

  if (base === "dockerfile" || base.startsWith("dockerfile.")) {
    return getEditorLanguageById("dockerfile");
  }
  if (base === "nginx.conf" || base.endsWith(".nginx")) {
    return getEditorLanguageById("nginx");
  }
  if (
    base === ".bashrc" ||
    base === ".bash_profile" ||
    base === ".bash_aliases" ||
    base === ".zshrc" ||
    base === ".zprofile" ||
    base === ".profile" ||
    base === "makefile" ||
    base === "gnumakefile"
  ) {
    return getEditorLanguageById("shell");
  }
  if (base === ".env" || base.startsWith(".env.")) {
    return getEditorLanguageById("properties");
  }

  const dotIdx = base.lastIndexOf(".");
  const ext = dotIdx > 0 ? base.slice(dotIdx + 1) : "";

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return getEditorLanguageById("javascript");
    case "jsx":
      return getEditorLanguageById("jsx");
    case "ts":
    case "mts":
    case "cts":
      return getEditorLanguageById("typescript");
    case "tsx":
      return getEditorLanguageById("tsx");
    case "json":
    case "jsonc":
      return getEditorLanguageById("json");
    case "py":
    case "pyw":
      return getEditorLanguageById("python");
    case "yml":
    case "yaml":
      return getEditorLanguageById("yaml");
    case "sql":
      return getEditorLanguageById("sql");
    case "html":
    case "htm":
      return getEditorLanguageById("html");
    case "css":
    case "scss":
      return getEditorLanguageById("css");
    case "xml":
    case "svg":
    case "plist":
      return getEditorLanguageById("xml");
    case "md":
    case "markdown":
      return getEditorLanguageById("markdown");
    case "sh":
    case "bash":
    case "zsh":
    case "ksh":
      return getEditorLanguageById("shell");
    case "ps1":
    case "psm1":
    case "psd1":
      return getEditorLanguageById("powershell");
    case "toml":
      return getEditorLanguageById("toml");
    case "ini":
    case "conf":
    case "cfg":
    case "cnf":
    case "service":
    case "timer":
    case "socket":
    case "properties":
    case "env":
      return getEditorLanguageById("properties");
    case "go":
      return getEditorLanguageById("go");
    case "rs":
      return getEditorLanguageById("rust");
    case "rb":
      return getEditorLanguageById("ruby");
    case "lua":
      return getEditorLanguageById("lua");
    default:
      return PLAIN_SPEC;
  }
}
