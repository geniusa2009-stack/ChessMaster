import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUZZLES } from "@/features/puzzles/lib/data.server";
import { buildTrainingAggregate } from "@/lib/training/aggregate";
import { selectNext, targetBandFromScore, type Candidate } from "@/features/training/lib/select";

export const runtime = "nodejs";

// Deterministic "what to train next". Returns a puzzle id + an explainable reason — never a
// canonical solution. The client then loads that puzzle's POSITION via /api/puzzles.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const agg = await buildTrainingAggregate(admin, profile.id);
  const { data: solves } = await admin.from("puzzle_solves").select("puzzle_id").eq("user_id", profile.id);
  const solved = new Set((solves ?? []).map((s) => s.puzzle_id));

  const candidates: Candidate[] = PUZZLES.map((p) => ({
    id: p.id, theme: p.theme, difficulty: p.difficulty, solved: solved.has(p.id),
  }));

  // Target difficulty from the user's weakest *sufficiently-measured* domain (fall back to the
  // overall mean, then to medium). With R4 content, every domain can accrue evidence.
  const measured = agg.skills.filter((s) => s.sufficient);
  const weakest = measured.slice().sort((a, b) => a.score - b.score)[0];
  const targetBand = targetBandFromScore(weakest?.score ?? 50, measured.length > 0);

  const rec = selectNext({
    candidates, dueReviewIds: agg.dueReviewIds, weaknessThemes: agg.weaknessThemes,
    hasHistory: agg.hasHistory, targetBand,
  });
  return NextResponse.json(rec);
}
