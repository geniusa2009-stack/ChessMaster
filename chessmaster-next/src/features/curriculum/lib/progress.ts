// Pure, deterministic per-skill progression model. Derives state from evidence the system already
// records (attempts, correct, distinct puzzles solved, due reviews) — NO new persistent state and
// NO change to R2's evidence thresholds. Curriculum-layer thresholds here are additional and are
// documented; they never weaken R2.
import { SKILLS, coverageStatus, type CoverageStatus, type CurriculumSkill } from "@/features/curriculum/lib/catalog";
import { prerequisitesSatisfied } from "@/features/curriculum/lib/graph";

export type SkillState = "locked" | "available" | "needs_more_evidence" | "practicing" | "proficient";

export interface SkillEvidence { attempts: number; correct: number; distinctSolved: number; dueCount: number }
export interface SkillProgress {
  skillId: string; domain: string; confidence: "verified" | "provisional";
  state: SkillState; reviewDue: boolean; coverage: CoverageStatus;
  attempts: number; correct: number; distinctSolved: number; eligible: number;
  prerequisites: string[]; prerequisitesMet: boolean;
}

// Documented curriculum-layer mastery rule (distinct from R2 domain confidence):
//  - proficient: solved >= min(5, eligible) DISTINCT items AND >= 5 attempts AND success rate >= 0.70
//  - practicing: >= 5 attempts but not yet proficient
//  - needs_more_evidence: 1..4 attempts (too few to judge — mirrors R2's minimum-evidence rule of five)
//  - available: 0 attempts and prerequisites satisfied
//  - locked: a prerequisite skill is not yet proficient
// One correct answer never yields proficiency; a skip (no attempt recorded) never advances state.
const PROFICIENCY_RATE = 0.7;
const MIN_ATTEMPTS = 5;

export function computeSkillProgress(
  evidence: Record<string, SkillEvidence>,
  eligibleCounts: Record<string, number>,
  skills: CurriculumSkill[] = SKILLS,
): Record<string, SkillProgress> {
  // First pass: determine proficiency per skill ignoring locks (proficiency depends only on evidence).
  const proficientSet = new Set<string>();
  const baseState: Record<string, SkillState> = {};
  for (const s of skills) {
    const ev = evidence[s.id] ?? { attempts: 0, correct: 0, distinctSolved: 0, dueCount: 0 };
    const eligible = eligibleCounts[s.id] ?? 0;
    const needDistinct = Math.min(5, eligible);
    const rate = ev.attempts > 0 ? ev.correct / ev.attempts : 0;
    let st: SkillState;
    if (ev.attempts === 0) st = "available";
    else if (ev.attempts < MIN_ATTEMPTS) st = "needs_more_evidence";
    else if (ev.distinctSolved >= needDistinct && rate >= PROFICIENCY_RATE) st = "proficient";
    else st = "practicing";
    if (st === "proficient") proficientSet.add(s.id);
    baseState[s.id] = st;
  }
  // Second pass: apply prerequisite locks + assemble.
  const out: Record<string, SkillProgress> = {};
  for (const s of skills) {
    const ev = evidence[s.id] ?? { attempts: 0, correct: 0, distinctSolved: 0, dueCount: 0 };
    const eligible = eligibleCounts[s.id] ?? 0;
    const met = prerequisitesSatisfied(s.id, proficientSet, skills);
    let state = baseState[s.id];
    // Lock only if untouched and prerequisites unmet (a learner already practising keeps their state).
    if (!met && ev.attempts === 0) state = "locked";
    out[s.id] = {
      skillId: s.id, domain: s.domain, confidence: s.confidence,
      state, reviewDue: ev.dueCount > 0, coverage: coverageStatus(eligible, s.confidence),
      attempts: ev.attempts, correct: ev.correct, distinctSolved: ev.distinctSolved, eligible,
      prerequisites: s.prerequisites, prerequisitesMet: met,
    };
  }
  return out;
}
