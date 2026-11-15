import React, { createContext, useContext, useState } from "react";
import vi from "./locales/vi.json";
import en from "./locales/en.json";

export type Locale = "vi" | "en";

const dictionaries: Record<Locale, Record<string, unknown>> = {
  vi,
  en,
};

export type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  setLocale: (loc: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "vi",
  setLocale: () => {},
  toggleLocale: () => {},
  t: (k) => k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("coreterm_locale");
    return saved === "en" || saved === "vi" ? saved : "vi";
  });

  const setLocale = (loc: Locale) => {
    setLocaleState(loc);
    localStorage.setItem("coreterm_locale", loc);
  };

  const toggleLocale = () => {
    setLocale(locale === "vi" ? "en" : "vi");
  };

  const t = (key: string, params?: TranslationParams): string => {
    const parts = key.split(".");
    let cur: unknown = dictionaries[locale];
    for (const p of parts) {
      if (
        cur &&
        typeof cur === "object" &&
        p in (cur as Record<string, unknown>)
      ) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return key;
      }
    }
    if (typeof cur !== "string") return key;
    if (!params) return cur;
    return cur.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
      token in params ? String(params[token]) : ""
    );
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, toggleLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
