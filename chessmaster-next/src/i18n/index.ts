import { en, type MessageKey, type Messages } from "@/i18n/messages/en";
import { ar } from "@/i18n/messages/ar";
import { fr } from "@/i18n/messages/fr";
import { es } from "@/i18n/messages/es";
import { ru } from "@/i18n/messages/ru";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

const CATALOGS: Record<Locale, Partial<Messages>> = { en, ar, fr, es, ru };

// Merge a locale over English so there are never missing-key holes (English fallback).
export function getMessages(locale: Locale): Messages {
  return { ...en, ...CATALOGS[locale] } as Messages;
}

export type Vars = Record<string, string | number>;

// Interpolates {var} placeholders as PLAIN TEXT. No HTML is produced or interpreted here,
// so a translation value or a variable can never inject markup/script — React escapes on render.
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function makeTranslator(locale: Locale) {
  const msgs = getMessages(locale);
  return (key: MessageKey, vars?: Vars): string => interpolate(msgs[key] ?? en[key] ?? String(key), vars);
}

export type { MessageKey, Messages };
export { DEFAULT_LOCALE };
