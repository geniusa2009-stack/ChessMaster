// Deterministic, explainable curriculum selection. Chooses the next SKILL from the prerequisite
// graph + progression state, then delegates to R2's existing selectNext for the PUZZLE within that
// skill (so due-review / weakness / progression / cold-start logic and tie-breaking are reused, not
// reinvented). Pure: identical inputs -> identical output. Never returns a solution.
import { SKILLS } from "@/features/curriculum/lib/catalog";
import { topoOrder } from "@/features/curriculum/lib/graph";
import type { SkillProgress } from "@/features/curriculum/lib/progress";
import { selectNext, type Candidate, type DifficultyBand } from "@/features/training/lib/select";

export type CurriculumReason = "review_due" | "weakness" | "progression" | "cold_start" | "reinforcement" | "none";

export interface CurriculumRecommendation {
  skillId: string | null;
  puzzleId: number | null;
  reason: CurriculumReason;
  theme?: string;
  difficulty?: DifficultyBand;
  contentStatus: "sufficient" | "limited" | "unavailable";
}

export interface CurriculumSelectInput {
  progress: Record<string, SkillProgress>;
  candidatesBySkill: Record<string, Candidate[]>; // eligible puzzles (with solved flag) per skill
  dueReviewIds: number[];
  weaknessThemes: string[];
  hasHistory: boolean;
  targetBand: DifficultyBand;
}

const ORDER = topoOrder(SKILLS);

export function selectCurriculumNext(input: CurriculumSelectInput): CurriculumRecommendation {
  const { progress, candidatesBySkill } = input;
  const dueSet = new Set(input.dueReviewIds);
  const weakSet = new Set(input.weaknessThemes);
  const inOrder = ORDER.map((id) => progress[id]).filter(Boolean) as SkillProgress[];
  const hasCands = (id: string) => (candidatesBySkill[id] ?? []).length > 0;

  const pick = (skillId: string, reason: CurriculumReason): CurriculumRecommendation => {
    const cands = candidatesBySkill[skillId] ?? [];
    const rec = selectNext({
      candidates: cands, dueReviewIds: input.dueReviewIds, weaknessThemes: input.weaknessThemes,
      hasHistory: input.hasHistory, targetBand: input.targetBand,
    });
    return { skillId, puzzleId: rec.puzzleId, reason, theme: rec.theme, difficulty: rec.difficulty, contentStatus: rec.contentStatus };
  };

  // 1) Due review takes priority (spaced repetition must not be starved by progression). Keyed off
  //    the authoritative dueReviewIds, not a display flag, so there is a single source of truth.
  for (const s of inOrder) {
    if ((candidatesBySkill[s.skillId] ?? []).some((c) => dueSet.has(c.id))) return pick(s.skillId, "review_due");
  }
  // 2) Weakness practice: an unlocked, non-proficient skill with an UNSOLVED candidate whose theme
  //    is a demonstrated weakness.
  for (const s of inOrder) {
    if (s.state === "locked" || s.state === "proficient") continue;
    if ((candidatesBySkill[s.skillId] ?? []).some((c) => !c.solved && weakSet.has(c.theme))) return pick(s.skillId, "weakness");
  }
  // 3) Progression / cold-start: first unlocked, not-yet-proficient skill that still has unsolved content.
  for (const s of inOrder) {
    if (s.state === "locked" || s.state === "proficient") continue;
    if ((candidatesBySkill[s.skillId] ?? []).some((c) => !c.solved)) return pick(s.skillId, input.hasHistory ? "progression" : "cold_start");
  }
  // 4) Reinforcement: everything available is proficient (or locked) — revisit a proficient skill
  //    with content, lowest in the order, for retention practice.
  for (const s of inOrder) {
    if (s.state === "proficient" && hasCands(s.skillId)) return pick(s.skillId, "reinforcement");
  }
  // 5) Nothing selectable.
  return { skillId: null, puzzleId: null, reason: "none", contentStatus: "unavailable" };
}

export interface SessionItem { skillId: string; puzzleId: number; reason: CurriculumReason; difficulty?: DifficultyBand }

// Build a bounded, deterministic practice session of DISTINCT puzzles. The first item is the primary
// recommendation; the rest are filled from the recommended skill then subsequent skills in graph
// order, taking due-review and unsolved items, never repeating a puzzle (spaced repetition handles
// legitimate repeats across sessions, not within one). Pure + bounded (O(candidates)).
export function buildCurriculumSession(input: CurriculumSelectInput, size: number): SessionItem[] {
  const out: SessionItem[] = [];
  const used = new Set<number>();
  const first = selectCurriculumNext(input);
  if (first.puzzleId == null || first.skillId == null) return out;
  out.push({ skillId: first.skillId, puzzleId: first.puzzleId, reason: first.reason, difficulty: first.difficulty });
  used.add(first.puzzleId);
  const dueSet = new Set(input.dueReviewIds);
  for (const skillId of ORDER) {
    const prog = input.progress[skillId];
    if (!prog || prog.state === "locked") continue;
    const cands = input.candidatesBySkill[skillId] ?? [];
    for (const c of cands) {
      if (out.length >= size) return out;
      if (used.has(c.id)) continue;
      if (dueSet.has(c.id) || !c.solved) {
        out.push({ skillId, puzzleId: c.id, reason: dueSet.has(c.id) ? "review_due" : "progression", difficulty: c.difficulty });
        used.add(c.id);
      }
    }
  }
  return out.slice(0, size);
}
