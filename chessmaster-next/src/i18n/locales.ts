// Supported locales (ported from the legacy app). `en` is the source of truth; others
// fall back to it for any missing key. Only `ar` is RTL.
export const LOCALES = ["en", "ar", "fr", "es", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en"; // new app is English-first (game content is English)
export const RTL_LOCALES: Locale[] = ["ar"];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English", ar: "العربية", fr: "Français", es: "Español", ru: "Русский",
};

export const LOCALE_COOKIE = "cm_lang";

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
// Whitelist: never let an arbitrary/untrusted value through.
export function normalizeLocale(v: unknown): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}
export function dirFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}
