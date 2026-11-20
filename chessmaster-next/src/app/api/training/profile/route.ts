import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTrainingAggregate } from "@/lib/training/aggregate";

export const runtime = "nodejs";

// A user's own training profile: skill domains, weaknesses, due reviews, Chess DNA, focus.
// Server-authoritative + private (own data only). Exposes NO puzzle solutions.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const agg = await buildTrainingAggregate(admin, profile.id);

  // recommended focus = the lowest-scoring domain that has sufficient evidence; else "warm up".
  const measured = agg.skills.filter((s) => s.sufficient).sort((a, b) => a.score - b.score);
  const focus = measured[0]?.domain ?? null;

  return NextResponse.json({
    skills: agg.skills,
    dna: agg.dna,
    weaknesses: agg.themeStats.filter((s) => s.sufficient && s.failRate >= 0.4),
    dueCount: agg.dueCount,
    focus,
    hasHistory: agg.hasHistory,
  });
}
