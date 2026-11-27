import React, { createContext, useContext, useEffect, useState } from "react";
import { STORAGE_KEY_LOCALE } from "@/shared/defaults";
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
  resetLocalePreference: () => void;
  toggleLocale: () => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "vi",
  localePreference: "vi",
  setLocale: () => {},
  setLocalePreference: () => {},
  resetLocalePreference: () => {},
  toggleLocale: () => {},
  t: (k) => k,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [localePreference, setLocalePreferenceState] = useState<LocalePreference>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LOCALE);
    return saved === "system" || saved === "en" || saved === "vi" ? saved : "vi";
  });
  const [systemLocale, setSystemLocale] = useState<Locale>(() => resolveSystemLocale());

  useEffect(() => {
    const onLangChange = () => setSystemLocale(resolveSystemLocale());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_LOCALE) {
        const next = e.newValue;
        setLocalePreferenceState(
          next === "system" || next === "en" || next === "vi" ? next : "vi"
        );
      }
    };
    window.addEventListener("languagechange", onLangChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("languagechange", onLangChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const locale: Locale =
    localePreference === "system" ? systemLocale : localePreference;

  const setLocalePreference = (pref: LocalePreference) => {
    setLocalePreferenceState(pref);
    localStorage.setItem(STORAGE_KEY_LOCALE, pref);
  };

  const resetLocalePreference = () => {
    localStorage.removeItem(STORAGE_KEY_LOCALE);
    setLocalePreferenceState("vi");
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
        resetLocalePreference,
        toggleLocale,
        t,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
