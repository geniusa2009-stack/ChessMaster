import { NextResponse } from "next/server";
import { getAuthedProfile } from "@/lib/auth/getUser";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCurriculumAggregate } from "@/lib/curriculum/aggregate.server";
import { computeSkillProgress } from "@/features/curriculum/lib/progress";
import { selectCurriculumNext } from "@/features/curriculum/lib/select";
import { SKILLS, UNAVAILABLE_SKILLS, getSkill } from "@/features/curriculum/lib/catalog";
import { targetBandFromScore, type Candidate } from "@/features/training/lib/select";

export const runtime = "nodejs";

// A learner's curriculum state: per-skill progression, the recommended next step with an
// explainable reason, and honest coverage. Server-authoritative, own-data only, NO solutions.
export async function GET() {
  const profile = await getAuthedProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();

  const { agg, evidence, eligible, solved } = await buildCurriculumAggregate(admin, profile.id);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(eligible)) counts[k] = v.length;

  const progress = computeSkillProgress(evidence, counts);

  // candidates per skill (ids/themes/difficulties + solved flag — never solutions)
  const candidatesBySkill: Record<string, Candidate[]> = {};
  for (const [skill, cands] of Object.entries(eligible)) {
    candidatesBySkill[skill] = cands.map((c) => ({ id: c.id, theme: c.theme, difficulty: c.difficulty, solved: solved.has(c.id) }));
  }

  // target difficulty from the weakest *sufficiently measured* R2 domain (else neutral)
  const measured = agg.skills.filter((s) => s.sufficient).sort((a, b) => a.score - b.score);
  const targetBand = targetBandFromScore(measured[0]?.score ?? 50, measured.length > 0);

  const recommendation = selectCurriculumNext({
    progress, candidatesBySkill, dueReviewIds: agg.dueReviewIds,
    weaknessThemes: agg.weaknessThemes, hasHistory: agg.hasHistory, targetBand,
  });

  const skills = SKILLS.map((s) => {
    const p = progress[s.id];
    return {
      id: s.id, domain: s.domain, nameKey: s.nameKey, objectiveKey: s.objectiveKey,
      confidence: s.confidence, prerequisites: s.prerequisites, prerequisitesMet: p.prerequisitesMet,
      state: p.state, reviewDue: p.reviewDue, coverage: p.coverage,
      eligible: p.eligible, attempts: p.attempts, distinctSolved: p.distinctSolved,
    };
  });

  return NextResponse.json({
    skills,
    unavailableSkills: UNAVAILABLE_SKILLS.map((u) => ({ id: u.id, domain: u.domain, nameKey: u.nameKey })),
    recommendation: {
      ...recommendation,
      skillNameKey: recommendation.skillId ? getSkill(recommendation.skillId)?.nameKey ?? null : null,
      objectiveKey: recommendation.skillId ? getSkill(recommendation.skillId)?.objectiveKey ?? null : null,
    },
    dueCount: agg.dueCount,
    hasHistory: agg.hasHistory,
  });
}
