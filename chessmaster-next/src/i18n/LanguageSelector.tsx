"use client";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/locales";

// Language preference is NOT security-sensitive. Selecting one sets the cookie + <html>
// dir/lang; server components pick it up on the next navigation/refresh.
export function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  return (
    <select aria-label="Language" className="cm-input" style={{ width: "auto", padding: "6px 10px" }}
      value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
      {LOCALES.map((l) => <option key={l} value={l}>{LOCALE_NAMES[l]}</option>)}
    </select>
  );
}
