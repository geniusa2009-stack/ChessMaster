import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/i18n/server";
import { dirFor } from "@/i18n/locales";
import { getMessages } from "@/i18n/index";
import { I18nProvider } from "@/i18n/I18nProvider";
import { TopNav } from "@/components/TopNav";
import { ThemeInit } from "@/features/settings/ThemeInit";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const m = getMessages(locale);
  return { title: m["home.title"], description: m["home.subtitle"] };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <I18nProvider initialLocale={locale}>
          <ThemeInit />
          <TopNav />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
