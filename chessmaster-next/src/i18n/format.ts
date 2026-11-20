import type { Locale } from "@/i18n/locales";

// Deterministic, locale-aware formatting. Uses Intl with an explicit UTC timeZone so the
// server and client render identical strings (no hydration mismatch). Stored values are
// never mutated — this is display only.
const INTL_LOCALE: Record<Locale, string> = {
  en: "en-GB", ar: "ar-EG", fr: "fr-FR", es: "es-ES", ru: "ru-RU",
};

export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(n);
}
