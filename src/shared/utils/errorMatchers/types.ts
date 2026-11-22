import type { TranslationParams } from "@/shared/i18n";

export interface ErrorMatcher {
  pattern: RegExp;
  key: string;
  params?: (match: RegExpMatchArray) => TranslationParams;
}
