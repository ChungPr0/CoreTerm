import React, { createContext, useContext, useEffect, useState } from "react";
import vi from "./locales/vi.json";
import en from "./locales/en.json";

export type Locale = "vi" | "en";
export type LocalePreference = "system" | Locale;

export function resolveSystemLocale(): Locale {
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    return navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
  }
  return "en";
}

const dictionaries: Record<Locale, Record<string, unknown>> = {
  vi,
  en,
};

export type TranslationParams = Record<string, string | number>;

interface I18nContextValue {
  locale: Locale;
  localePreference: LocalePreference;
  setLocale: (loc: Locale) => void;
  setLocalePreference: (pref: LocalePreference) => void;
  toggleLocale: () => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "vi",
  localePreference: "vi",
  setLocale: () => {},
  setLocalePreference: () => {},
  toggleLocale: () => {},
  t: (k) => k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>(() => {
    const saved = localStorage.getItem("coreterm_locale");
    return saved === "system" || saved === "en" || saved === "vi" ? saved : "vi";
  });
  const [systemLocale, setSystemLocale] = useState<Locale>(() => resolveSystemLocale());

  useEffect(() => {
    const onLangChange = () => setSystemLocale(resolveSystemLocale());
    window.addEventListener("languagechange", onLangChange);
    return () => window.removeEventListener("languagechange", onLangChange);
  }, []);

  const locale: Locale =
    localePreference === "system" ? systemLocale : localePreference;

  const setLocalePreference = (pref: LocalePreference) => {
    setLocalePreferenceState(pref);
    localStorage.setItem("coreterm_locale", pref);
  };

  const setLocale = (loc: Locale) => {
    setLocalePreference(loc);
  };

  const toggleLocale = () => {
    setLocalePreference(locale === "vi" ? "en" : "vi");
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
    <I18nContext.Provider
      value={{
        locale,
        localePreference,
        setLocale,
        setLocalePreference,
        toggleLocale,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
