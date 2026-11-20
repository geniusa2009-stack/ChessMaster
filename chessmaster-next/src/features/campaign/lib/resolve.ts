// Pure campaign resolver: maps each level to real practice content (puzzle ids / opening ids) and
// decides playable vs planned from actual availability. No I/O, no server-only import — so it runs
// in the server module (fed the server-only corpus) AND in report scripts/tests (fed a parsed
// corpus). Single source of truth for campaign content resolution. Never handles solutions.
import { LEVELS, type PublicationStatus, type Band } from "@/features/campaign/lib/catalog";

export interface Candidate { id: number; difficulty: string }
export interface OpeningRef { id: string; tier: string }
export interface ResolvedLevel {
  id: string; status: PublicationStatus; playable: boolean;
  practiceKind: "puzzles" | "openings" | "none" | "lesson" | "rules_assessment";
  itemIds: Array<number | string>; itemCount: number; minExercises: number;
}

const TIER_FOR_BAND: Record<Band, string> = { easy: "beginner", medium: "intermediate", hard: "advanced", expert: "advanced" };
const SET_TARGET = 5;

function puzzlePool(elig: Record<string, Candidate[]>, skill: string, band: Band | null): number[] {
  const byBand = (s: string) => (elig[s] ?? []).filter((c) => !band || c.difficulty === band).map((c) => c.id);
  if (skill === "__mixed__") return ["tactical_recognition", "defensive_resources", "calculation_combinations"].flatMap(byBand);
  if (skill === "__advanced__") return ["tactical_recognition", "calculation_combinations", "defensive_resources", "endgame_conversion", "forced_mate"].flatMap(byBand);
  if (skill === "__final__") return ["mate_in_one", "forced_mate", "tactical_recognition", "calculation_combinations", "defensive_resources", "endgame_conversion"].flatMap((s) => (elig[s] ?? []).map((c) => c.id));
  return byBand(skill);
}

// Pure: count, per level, how many of its assigned practice items the learner has actually
// completed — puzzle solves (numbers) or opening completions (strings). Authoritative inputs are
// server-fetched; this function does no I/O, so it is unit-testable.
export function countSolvedByLevel(
  resolved: Record<string, ResolvedLevel>,
  solvedPuzzleIds: Set<number>,
  completedOpeningIds: Set<string>,
  foundationPassed = false,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of Object.entries(resolved)) {
    if (r.practiceKind === "puzzles") out[id] = r.itemIds.filter((i) => typeof i === "number" && solvedPuzzleIds.has(i)).length;
    else if (r.practiceKind === "openings") out[id] = r.itemIds.filter((i) => typeof i === "string" && completedOpeningIds.has(i)).length;
    else if (r.practiceKind === "rules_assessment") out[id] = foundationPassed ? r.minExercises : 0;
    else out[id] = 0;
  }
  return out;
}

export function resolveCampaignPure(elig: Record<string, Candidate[]>, openings: OpeningRef[]): Record<string, ResolvedLevel> {
  const consumedPuzzles = new Map<string, Set<number>>();
  const consumedOpenings = new Map<string, Set<string>>();
  const out: Record<string, ResolvedLevel> = {};
  for (const lv of LEVELS) {
    // CH01 foundation lesson (interactive demos, ungraded) → content-backed/ready.
    if (lv.practiceKindHint === "lesson") {
      const ids = lv.demoIds ?? [];
      out[lv.id] = { id: lv.id, status: "ready", playable: true, practiceKind: "lesson", itemIds: ids, itemCount: ids.length, minExercises: 0 };
      continue;
    }
    // CH01 foundations rules assessment (server-verified, graded).
    if (lv.skillId === "__foundation__" || lv.practiceKindHint === "rules_assessment") {
      out[lv.id] = { id: lv.id, status: "ready", playable: true, practiceKind: "rules_assessment", itemIds: ["FOUNDATION"], itemCount: 1, minExercises: 1 };
      continue;
    }
    const needsPractice = lv.type === "guided_practice" || lv.type === "independent_practice" || lv.type === "assessment" || lv.type === "boss_challenge";
    if (!needsPractice) { out[lv.id] = { id: lv.id, status: lv.status, playable: false, practiceKind: "none", itemIds: [], itemCount: 0, minExercises: lv.minExercises }; continue; }
    if (!lv.skillId) { out[lv.id] = { id: lv.id, status: "future_content_required", playable: false, practiceKind: "none", itemIds: [], itemCount: 0, minExercises: lv.minExercises }; continue; }

    if (lv.skillId === "__openings__") {
      const tier = TIER_FOR_BAND[lv.band ?? "easy"];
      const key = `op:${tier}`;
      const used = consumedOpenings.get(key) ?? new Set<string>();
      const avail = openings.filter((o) => o.tier === tier && !used.has(o.id)).map((o) => o.id);
      const take = avail.slice(0, Math.max(SET_TARGET - 2, 3));
      take.forEach((id) => used.add(id)); consumedOpenings.set(key, used);
      const minOpen = 2;
      const playable = take.length >= minOpen;
      out[lv.id] = { id: lv.id, status: playable ? "ready" : "future_content_required", playable, practiceKind: "openings", itemIds: take, itemCount: take.length, minExercises: minOpen };
      continue;
    }
    // Assessments & bosses are CUMULATIVE: they draw from the whole skill pool (all bands) via a
    // dedicated key, so they never starve competing with the per-band practice sets.
    const isAssess = lv.type === "assessment" || lv.type === "boss_challenge";
    const band = isAssess ? null : lv.band;
    const key = isAssess ? `${lv.skillId}:assess` : `${lv.skillId}:${lv.band}`;
    const used = consumedPuzzles.get(key) ?? new Set<number>();
    const pool = puzzlePool(elig, lv.skillId, band).filter((id) => !used.has(id));
    const take = pool.slice(0, isAssess ? Math.max(SET_TARGET, lv.minExercises) : SET_TARGET);
    take.forEach((id) => used.add(id)); consumedPuzzles.set(key, used);
    const playable = take.length >= lv.minExercises;
    out[lv.id] = { id: lv.id, status: playable ? "ready" : "future_content_required", playable, practiceKind: "puzzles", itemIds: take, itemCount: take.length, minExercises: lv.minExercises };
  }
  return out;
}
