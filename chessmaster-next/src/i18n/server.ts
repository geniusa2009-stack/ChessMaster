import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "@/i18n/locales";
import { makeTranslator } from "@/i18n/index";

// Server-side locale from the cookie (whitelisted). Used by the root layout + server pages.
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  return normalizeLocale(c.get(LOCALE_COOKIE)?.value);
}
export async function getServerT() {
  const locale = await getLocale();
  return { locale, t: makeTranslator(locale) };
}
