export { FileEditorPane } from "./components/FileEditorPane";
export { EditorGotoLineModal } from "./components/EditorGotoLineModal";
export { buildEditorContextItems } from "./menus/editorMenus";
export {
  EDITOR_LANGUAGES,
  convertLineEnding,
  detectEditorLanguage,
  detectLineEnding,
  getEditorLanguageById,
  normalizeToLf,
  type EditorLanguageSpec,
  type EditorLineEnding,
} from "./utils/editorLanguage";
export {
  coreTermSyntaxHighlighting,
  createCoreTermEditorTheme,
} from "./utils/editorTheme";
export type {
  EditorCursorPos,
  EditorDiscardAction,
  FileEditorPaneProps,
} from "./types";
