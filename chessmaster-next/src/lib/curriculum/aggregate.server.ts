import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTrainingAggregate, type TrainingAggregate } from "@/lib/training/aggregate";
import { eligibleBySkill, type SkillCandidate } from "@/features/curriculum/lib/eligibility.server";
import { skillForPuzzle } from "@/features/curriculum/lib/catalog";
import type { SkillEvidence } from "@/features/curriculum/lib/progress";

// Compatibility mapping for a historical event: prefer the CURRENT skill of the attempted puzzle id
// (so a reclassified puzzle, e.g. the R4.1 id-165 fix, is counted under its corrected skill), then
// fall back to the event's stored domain/theme, then a theme-only guess for very old rows.
function themeFallback(theme: string): string | null {
  if (/^mateIn1$/i.test(theme)) return "mate_in_one";
  if (/^mateIn\d+$/i.test(theme)) return "forced_mate";
  if (/defens/i.test(theme)) return "defensive_resources";
  if (/^win_material$|fork|discovered|pin|skewer/i.test(theme)) return "tactical_recognition";
  return null;
}

export interface CurriculumAggregate {
  agg: TrainingAggregate;
  evidence: Record<string, SkillEvidence>;
  eligible: Record<string, SkillCandidate[]>;
  idToSkill: Map<number, string>;
  solved: Set<number>;
}

export async function buildCurriculumAggregate(admin: SupabaseClient, userId: string): Promise<CurriculumAggregate> {
  const agg = await buildTrainingAggregate(admin, userId);
  const eligible = eligibleBySkill();
  const idToSkill = new Map<number, string>();
  for (const [skill, cands] of Object.entries(eligible)) for (const c of cands) idToSkill.set(c.id, skill);

  const { data: evRows } = await admin
    .from("training_events").select("ref_id, theme, domain, outcome")
    .eq("user_id", userId).order("created_at", { ascending: true }).limit(500);
  const { data: solveRows } = await admin.from("puzzle_solves").select("puzzle_id").eq("user_id", userId);
  const solved = new Set<number>((solveRows ?? []).map((r) => r.puzzle_id as number));

  const evidence: Record<string, SkillEvidence> = {};
  const ensure = (s: string) => (evidence[s] ??= { attempts: 0, correct: 0, distinctSolved: 0, dueCount: 0 });

  for (const e of evRows ?? []) {
    const ref = (e as { ref_id?: number }).ref_id;
    const skill = (ref != null && idToSkill.get(ref))
      || skillForPuzzle({ domain: (e as { domain?: string }).domain ?? "", theme: e.theme })
      || themeFallback(e.theme);
    if (!skill) continue;
    const ev = ensure(skill);
    ev.attempts++;
    if (e.outcome === "success") ev.correct++;
  }
  const solvedBySkill: Record<string, Set<number>> = {};
  for (const id of solved) { const s = idToSkill.get(id); if (s) (solvedBySkill[s] ??= new Set()).add(id); }
  for (const [s, set] of Object.entries(solvedBySkill)) ensure(s).distinctSolved = set.size;
  for (const id of agg.dueReviewIds) { const s = idToSkill.get(id); if (s) ensure(s).dueCount++; }

  return { agg, evidence, eligible, idToSkill, solved };
}
