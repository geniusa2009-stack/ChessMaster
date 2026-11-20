import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { questDef, isQuestComplete, utcDateStr } from "@/features/rpg/lib/quests";
import { questClaimSchema } from "@/lib/validation/schemas";
import { todayCounts } from "@/lib/progression/snapshot";
import { awardXp } from "@/lib/progression/awardXp";
import { rateLimit, clientIp } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`quest:${profile.id}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = questClaimSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const def = questDef(parsed.data.questKey);
  if (!def) return NextResponse.json({ error: "No such quest" }, { status: 404 });

  const admin = createAdminClient();
  // Progress is derived from real events — the client cannot fake completion.
  const counts = await todayCounts(admin, profile.id);
  if (!isQuestComplete(def, counts[def.key])) {
    return NextResponse.json({ error: "Quest not complete yet" }, { status: 422 });
  }

  const today = utcDateStr();
  // Idempotent claim: unique (user, quest, day). Reward is server-defined.
  const { error: insErr } = await admin.from("quest_claims").insert({
    user_id: profile.id, quest_key: def.key, quest_date: today, xp_awarded: def.reward,
  });
  if (insErr) {
    if (insErr.code === "23505") return NextResponse.json({ status: "already_claimed", accepted: false });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const xp = await awardXp(admin, profile.id, def.reward);
  return NextResponse.json({ status: "ok", accepted: true, xpAwarded: def.reward, xp });
}
