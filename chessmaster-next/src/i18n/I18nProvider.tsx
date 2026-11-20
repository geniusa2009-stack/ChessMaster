"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { LOCALE_COOKIE, dirFor, normalizeLocale, type Locale } from "@/i18n/locales";
import { makeTranslator, type MessageKey, type Vars } from "@/i18n/index";

interface I18nCtx {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  setLocale: (l: Locale) => void;
}
const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(normalizeLocale(initialLocale));

  const setLocale = useCallback((l: Locale) => {
    const loc = normalizeLocale(l);
    setLocaleState(loc);
    // Persist as a cookie (whitelisted value only); survives reload + reaches the server.
    try {
      document.cookie = `${LOCALE_COOKIE}=${loc}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = loc;
      document.documentElement.dir = dirFor(loc);
    } catch { /* ignore */ }
  }, []);

  const t = useMemo(() => makeTranslator(locale), [locale]);
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}
export function useT() { return useI18n().t; }
