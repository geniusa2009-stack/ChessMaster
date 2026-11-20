"use client";
import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";
import { LanguageSelector } from "@/i18n/LanguageSelector";

// Uses logical properties (gap / margin-inline) so it lays out correctly in RTL and LTR.
export function TopNav() {
  const t = useT();
  const links: [string, string][] = [
    ["/play", t("nav.play")],
    ["/campaign", t("nav.campaign")],
    ["/puzzles", t("nav.puzzles")],
    ["/training", t("nav.training")],
    ["/openings", t("nav.openings")],
    ["/progress", t("nav.progress")],
    ["/leaderboard", t("nav.leaderboard")],
    ["/certificates", t("nav.certificates")],
    ["/profile", t("profile.title")],
    ["/settings", t("settings.title")],
  ];
  return (
    <nav aria-label="Primary" style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 20px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
      <Link href="/" style={{ fontWeight: 900, color: "var(--green-glow)", textDecoration: "none" }}>♞ ChessMaster</Link>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flex: 1 }}>
        {links.map(([href, label]) => (
          <Link key={href} href={href} style={{ color: "var(--off-white)", textDecoration: "none", fontSize: 14 }}>{label}</Link>
        ))}
      </div>
      <LanguageSelector />
    </nav>
  );
}
