import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateAchievements } from "@/features/rpg/lib/achievements";
import { lifetimeStats } from "@/lib/progression/snapshot";

export const runtime = "nodejs";

// Evaluates unlock conditions from AUTHORITATIVE data and inserts any newly-earned
// achievements idempotently. The client cannot assert an unlock. No XP is granted.
export async function POST() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const stats = await lifetimeStats(admin, profile.id);
  const qualified = evaluateAchievements(stats);

  const { data: earned } = await admin
    .from("user_achievements").select("achievement_key").eq("user_id", profile.id);
  const earnedKeys = new Set((earned ?? []).map((a) => a.achievement_key));
  const toInsert = qualified.filter((k) => !earnedKeys.has(k));

  if (toInsert.length) {
    await admin.from("user_achievements").upsert(
      toInsert.map((k) => ({ user_id: profile.id, achievement_key: k })),
      { onConflict: "user_id,achievement_key", ignoreDuplicates: true }
    );
  }
  return NextResponse.json({ status: "ok", newlyEarned: toInsert });
}
