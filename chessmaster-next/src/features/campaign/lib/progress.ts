// Pure, deterministic per-level campaign state. Reuses authoritative learner evidence (count of a
// level's practice items the learner has actually solved) computed server-side. NO client trust.
import { LEVELS, type Level } from "@/features/campaign/lib/catalog";

export type LevelState = "locked" | "available" | "in_progress" | "passed" | "planned";

export interface LevelProgress {
  id: string; state: LevelState; unlocked: boolean;
  solved: number; required: number; playable: boolean;
}

export interface ProgressInput {
  // per level: how many of its assigned practice items the learner has solved (server-computed)
  solvedByLevel: Record<string, number>;
  // per level: resolved required count + playability (from the server resolver)
  resolved: Record<string, { playable: boolean; minExercises: number }>;
}

// A graded level is "passed" when the learner solved >= its required items AND it is playable.
// concept/review levels are never "passed" (ungraded) — they are "available" once unlocked.
const isGraded = (l: Level) => l.type === "guided_practice" || l.type === "independent_practice" || l.type === "assessment" || l.type === "boss_challenge";

// Single forward pass (prerequisites always precede a level in catalog order). A prerequisite is
// "satisfied" if it was passed (graded levels) OR it is an ungraded, non-planned concept/review
// level that is itself reachable — ungraded lessons order the path but never block it.
export function computeCampaignState(input: ProgressInput, levels: Level[] = LEVELS): Record<string, LevelProgress> {
  const satisfied = new Set<string>();
  const out: Record<string, LevelProgress> = {};
  for (const l of levels) {
    const r = input.resolved[l.id] ?? { playable: false, minExercises: l.minExercises };
    const solved = input.solvedByLevel[l.id] ?? 0;
    const graded = isGraded(l);
    const unlocked = l.prerequisites.every((p) => satisfied.has(p));
    let state: LevelState;
    if (graded && !r.playable) state = "planned";
    else if (!graded && l.status === "future_content_required") state = "planned";
    else if (!unlocked) state = "locked";
    else if (graded && r.playable && solved >= r.minExercises) state = "passed";
    else if (graded && solved > 0) state = "in_progress";
    else state = "available";
    if (state === "passed") satisfied.add(l.id);
    else if (!graded && state === "available") satisfied.add(l.id); // ungraded lesson does not gate
    else if (state === "planned") satisfied.add(l.id); // a content-missing level must not block the path
    out[l.id] = { id: l.id, state, unlocked, solved, required: r.minExercises, playable: r.playable };
  }
  return out;
}
