import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthedProfile, isAdmin } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { lifetimeStats } from "@/lib/progression/snapshot";
import { levelFromXp, tierFromXp } from "@/lib/progression/level";
import { getServerT } from "@/i18n/server";

// Read-only profile. Every value is authoritative (from the DB) or derived — there are NO
// editable fields (legacy parity: the legacy app had no profile editing). Shows only the
// signed-in user's own data; no other user's private fields are read here.
export default async function ProfilePage() {
  const profile = await getAuthedProfile();
  if (!profile) redirect("/login?next=/profile");
  const { t } = await getServerT();
  const admin = createAdminClient();

  const { data: p } = await admin
    .from("profiles").select("xp, rating, wins, losses, draws, puzzle_rating, best_puzzle_streak").eq("id", profile.id).single();
  const stats = await lifetimeStats(admin, profile.id);
  const [{ count: achCount }, { count: certCount }] = await Promise.all([
    admin.from("user_achievements").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
    admin.from("certificates").select("*", { count: "exact", head: true }).eq("user_id", profile.id),
  ]);

  const xp = p?.xp ?? 0;
  const tier = tierFromXp(xp);
  const rows: [string, string | number][] = [
    [t("profile.rating"), p?.rating ?? 800],
    [t("profile.level"), levelFromXp(xp)],
    [t("profile.tier"), `${tier.icon} ${t("tier." + tier.key as "tier.bronze")}`],
    [t("profile.xp"), xp],
    [t("profile.record"), `${p?.wins ?? 0} / ${p?.losses ?? 0} / ${p?.draws ?? 0}`],
    [t("profile.puzzles"), stats.puzzleSolveCount],
    [t("profile.puzzleRating"), p?.puzzle_rating ?? 1200],
    [t("profile.bestStreak"), p?.best_puzzle_streak ?? 0],
    [t("profile.openings"), stats.masteredOpenings],
    [t("profile.achievements"), achCount ?? 0],
    [t("profile.certificates"), certCount ?? 0],
  ];

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--green)", color: "#10240a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900 }}>
          {profile.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 style={{ margin: 0, color: "var(--green-glow)" }}>{profile.username}</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{t("profile.title")}</div>
        </div>
      </div>

      <div className="cm-panel" style={{ padding: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} style={{ borderTop: "1px solid var(--line)" }}>
                <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{label}</td>
                <td style={{ padding: "10px 12px", textAlign: "end", fontWeight: 700 }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="cm-btn" href="/certificates">{t("profile.viewCertificates")}</Link>
        <Link className="cm-btn" href="/leaderboard">{t("profile.viewLeaderboard")}</Link>
        <Link className="cm-btn" style={{ background: "#2a2825", color: "var(--off-white)" }} href="/settings">{t("settings.title")}</Link>
        {isAdmin(profile) && <Link className="cm-btn" style={{ background: "#3a4b63", color: "#fff" }} href="/admin">{t("admin.openDashboard")}</Link>}
      </div>
    </main>
  );
}
