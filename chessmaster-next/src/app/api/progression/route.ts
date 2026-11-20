import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { levelFromXp, xpIntoLevel, xpForNextLevel, tierFromXp } from "@/lib/progression/level";
import { QUEST_DEFS, isQuestComplete, utcDateStr } from "@/features/rpg/lib/quests";
import { ACHIEVEMENT_DEFS } from "@/features/rpg/lib/achievements";
import { PERK_DEFS } from "@/features/rpg/lib/perks";
import { todayCounts } from "@/lib/progression/snapshot";

export const runtime = "nodejs";

// One authoritative snapshot for the whole RPG UI. Everything here is server-derived.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const { data: prof } = await admin
    .from("profiles").select("xp, puzzle_streak, best_puzzle_streak").eq("id", profile.id).single();
  const xp = prof?.xp ?? 0;

  const counts = await todayCounts(admin, profile.id);
  const today = utcDateStr();
  const [{ data: claims }, { data: earned }, { data: perks }] = await Promise.all([
    admin.from("quest_claims").select("quest_key").eq("user_id", profile.id).eq("quest_date", today),
    admin.from("user_achievements").select("achievement_key").eq("user_id", profile.id),
    admin.from("user_perks").select("perk_key").eq("user_id", profile.id),
  ]);
  const claimedKeys = new Set((claims ?? []).map((c) => c.quest_key));
  const earnedKeys = new Set((earned ?? []).map((a) => a.achievement_key));
  const ownedPerks = new Set((perks ?? []).map((p) => p.perk_key));

  const quests = QUEST_DEFS.map((q) => {
    const progress = Math.min(counts[q.key], q.target);
    return { key: q.key, title: q.title, target: q.target, progress, reward: q.reward,
      done: isQuestComplete(q, counts[q.key]), claimed: claimedKeys.has(q.key) };
  });

  return NextResponse.json({
    xp,
    level: levelFromXp(xp),
    xpIntoLevel: xpIntoLevel(xp),
    xpForNextLevel: xpForNextLevel(),
    tier: tierFromXp(xp),
    streak: prof?.puzzle_streak ?? 0,
    bestStreak: prof?.best_puzzle_streak ?? 0,
    quests,
    achievements: ACHIEVEMENT_DEFS.map((a) => ({ key: a.key, title: a.title, earned: earnedKeys.has(a.key) })),
    perks: PERK_DEFS.map((p) => ({ key: p.key, title: p.title, description: p.description, cost: p.cost, owned: ownedPerks.has(p.key) })),
  });
}
