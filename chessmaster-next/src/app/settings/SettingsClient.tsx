"use client";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { LanguageSelector } from "@/i18n/LanguageSelector";
import { logoutAction } from "@/app/(auth)/actions";
import { THEMES, type Theme } from "@/features/settings/lib/prefs";
import { getTheme, setTheme, isSoundEnabled, setSoundEnabled } from "@/features/settings/lib/clientPrefs";

// All settings here are PRESENTATION-ONLY client preferences (localStorage). None are sent to
// the server or used for authorization. Account actions use Supabase Auth.
export function SettingsClient() {
  const t = useT();
  const [theme, setThemeState] = useState<Theme>("default");
  const [sound, setSound] = useState(true);
  useEffect(() => { setThemeState(getTheme()); setSound(isSoundEnabled()); }, []);

  const onTheme = (th: Theme) => { setTheme(th); setThemeState(th); };
  const onSound = (on: boolean) => { setSoundEnabled(on); setSound(on); };
  const themeLabel = (th: Theme) => th === "default" ? t("settings.theme.default") : th === "light" ? t("settings.theme.light") : t("settings.theme.midnight");

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{t("settings.title")}</h1>

      <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 12 }}>
        <Row label={t("settings.language")}><LanguageSelector /></Row>

        <Row label={t("settings.theme")}>
          <select className="cm-input" style={{ width: "auto" }} value={theme} onChange={(e) => onTheme(e.target.value as Theme)}>
            {THEMES.map((th) => <option key={th} value={th}>{themeLabel(th)}</option>)}
          </select>
        </Row>

        <Row label={t("settings.sound")}>
          <button className="cm-btn" style={{ background: sound ? "var(--green)" : "#3a4b63", color: sound ? "#10240a" : "#fff", padding: "6px 16px" }}
            onClick={() => onSound(!sound)}>
            {sound ? t("settings.on") : t("settings.off")}
          </button>
        </Row>
      </section>

      <section className="cm-panel" style={{ padding: 16, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: "var(--muted)" }}>{t("settings.account")}</h2>
        <form action={logoutAction}>
          <button className="cm-btn" style={{ background: "#b3413a", color: "#fff" }} type="submit">{t("settings.logout")}</button>
        </form>
      </section>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}
