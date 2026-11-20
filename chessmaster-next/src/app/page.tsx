import Link from "next/link";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { getServerT } from "@/i18n/server";

export default async function Home() {
  const profile = await getAuthedProfile();
  const { t } = await getServerT();
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px" }}>
      <h1 style={{ fontSize: 40, fontWeight: 900, color: "var(--green-glow)" }}>♞ {t("home.title")}</h1>
      <p style={{ color: "var(--muted)", fontSize: 18 }}>{t("home.subtitle")}</p>

      <div className="cm-panel" style={{ padding: 20, marginTop: 24 }}>
        {profile ? (
          <>
            <p>{t("home.signedInAs", { name: profile.username })}</p>
            <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <Link className="cm-btn" href="/play">{t("nav.play")}</Link>
              <Link className="cm-btn" href="/leaderboard">{t("nav.leaderboard")}</Link>
              <Link className="cm-btn" href="/certificates">{t("nav.certificates")}</Link>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="cm-btn" href="/login">{t("nav.login")}</Link>
            <Link className="cm-btn" href="/register">{t("nav.register")}</Link>
          </div>
        )}
      </div>
    </main>
  );
}
