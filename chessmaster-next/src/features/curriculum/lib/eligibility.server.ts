import "server-only";
// Server-only bridge between the public curriculum catalog and the server-only puzzle corpus.
// Computes which puzzle IDs are eligible for each skill (deterministic, from authoritative metadata)
// WITHOUT ever exposing solutions. Returns only ids/themes/difficulties — safe to send to a client.
import { PUZZLES } from "@/features/puzzles/lib/data.server";
import { skillForPuzzle, SKILLS } from "@/features/curriculum/lib/catalog";

export interface SkillCandidate { id: number; theme: string; difficulty: "easy" | "medium" | "hard" | "expert" }

export function eligibleBySkill(): Record<string, SkillCandidate[]> {
  const out: Record<string, SkillCandidate[]> = {};
  for (const s of SKILLS) out[s.id] = [];
  for (const p of PUZZLES) {
    const skill = skillForPuzzle(p);
    if (skill && out[skill]) out[skill].push({ id: p.id, theme: p.theme, difficulty: p.difficulty });
  }
  // deterministic order within a skill: by difficulty then id
  const rank: Record<string, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };
  for (const k of Object.keys(out)) out[k].sort((a, b) => (rank[a.difficulty] - rank[b.difficulty]) || (a.id - b.id));
  return out;
}

export function eligibleCounts(): Record<string, number> {
  const e = eligibleBySkill();
  const o: Record<string, number> = {};
  for (const k of Object.keys(e)) o[k] = e[k].length;
  return o;
}

export function difficultyRange(cands: SkillCandidate[]): string[] {
  return Array.from(new Set(cands.map((c) => c.difficulty)));
}
