import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORLDS, CHAPTERS, LEVELS } from "@/features/campaign/lib/catalog";
import { resolveCampaign, effectiveStatus } from "@/features/campaign/lib/eligibility.server";
import { countSolvedByLevel } from "@/features/campaign/lib/resolve";
import { computeCampaignState } from "@/features/campaign/lib/progress";

export const runtime = "nodejs";

// A learner's campaign state: worlds/chapters/levels with server-authoritative unlock + progress.
// No puzzle solutions are returned. Level→practice puzzle ids are public (positions are already
// public via /api/puzzles); they are included only for unlocked, playable levels to launch practice.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const resolved = resolveCampaign(); // server-only; decides playable vs planned from real content
  const { data: solves } = await admin.from("puzzle_solves").select("puzzle_id").eq("user_id", profile.id);
  const solvedSet = new Set<number>((solves ?? []).map((s) => s.puzzle_id as number));
  // R7.1: opening-line levels derive completion from the authoritative opening_progress table
  // (written server-side only after validateCompletion). One idempotent row per opening — no double
  // counting. This closes the R7 gap where opening levels could never pass.
  const { data: opens } = await admin.from("opening_progress").select("opening_id").eq("user_id", profile.id);
  const completedOpenings = new Set<string>((opens ?? []).map((o) => o.opening_id as string));
  // R7.2: CH01 foundations completion gates CH02 — read the authoritative, server-written record.
  const { data: fa } = await admin.from("foundation_assessment").select("passed").eq("user_id", profile.id).eq("assessment_id", "CH01").maybeSingle();
  const foundationPassed = !!fa?.passed;

  const solvedByLevel = countSolvedByLevel(resolved, solvedSet, completedOpenings, foundationPassed);

  const state = computeCampaignState({ solvedByLevel, resolved: Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, { playable: v.playable, minExercises: v.minExercises }])) }, LEVELS);

  const levels = LEVELS.map((l) => {
    const r = resolved[l.id];
    const st = state[l.id];
    const unlockedPlayable = st.unlocked && r && r.playable && st.state !== "passed";
    return {
      id: l.id, worldId: l.worldId, chapterId: l.chapterId, title: l.title, type: l.type, band: l.band,
      domain: l.domain, skillId: l.skillId, objective: l.learningObjective,
      status: effectiveStatus(l, r), state: st.state, unlocked: st.unlocked,
      solved: st.solved, required: r?.minExercises ?? l.minExercises, playable: !!r?.playable,
      practiceKind: r?.practiceKind ?? "none",
      // ids only for unlocked playable levels so the client can launch practice (no solutions)
      practiceItemIds: unlockedPlayable ? r!.itemIds : [],
      videoIds: l.videoIds, prerequisites: l.prerequisites, nextLevelId: l.nextLevelId,
    };
  });

  const summary = {
    totalLevels: LEVELS.length,
    playable: levels.filter((l) => l.playable).length,
    passed: Object.values(state).filter((s) => s.state === "passed").length,
    available: Object.values(state).filter((s) => s.state === "available").length,
    locked: Object.values(state).filter((s) => s.state === "locked").length,
    planned: Object.values(state).filter((s) => s.state === "planned").length,
  };

  return NextResponse.json({ worlds: WORLDS, chapters: CHAPTERS, levels, summary });
}
