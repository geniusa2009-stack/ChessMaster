// Deterministic adaptive content selection. Given the same inputs it ALWAYS returns the same
// recommendation (tie-break by puzzle id). Priority order with an explicit reason:
//   1) due review (a previously-seen puzzle whose review is due)
//   2) weakness practice (an UNSOLVED puzzle whose theme is a demonstrated weakness)
//   3) progression (next unsolved puzzle at an appropriate difficulty)
//   4) cold start (easiest unsolved puzzle) when there's little/no history
// Never returns a canonical solution; only a puzzle id + reason.
export type DifficultyBand = "easy" | "medium" | "hard" | "expert";
const BAND_RANK: Record<DifficultyBand, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };

export interface Candidate { id: number; theme: string; difficulty: DifficultyBand; solved: boolean }
export type ContentStatus = "sufficient" | "limited" | "unavailable";

export interface Recommendation {
  puzzleId: number | null;
  reason: "due_review" | "weakness" | "progression" | "cold_start" | "none";
  theme?: string;
  difficulty?: DifficultyBand;
  contentStatus: ContentStatus;
}

export interface SelectInput {
  candidates: Candidate[];
  dueReviewIds: number[];          // puzzle ids whose review is due (seen before)
  weaknessThemes: string[];        // from mistake memory
  hasHistory: boolean;             // any attempts at all
  targetBand: DifficultyBand;      // appropriate difficulty from skill
}

export function selectNext(input: SelectInput): Recommendation {
  const { candidates } = input;
  const contentStatus: ContentStatus =
    candidates.length === 0 ? "unavailable" : candidates.length < 5 ? "limited" : "sufficient";
  if (candidates.length === 0) return { puzzleId: null, reason: "none", contentStatus };

  const byId = (a: Candidate, b: Candidate) => a.id - b.id;

  // 1) due review
  const dueSet = new Set(input.dueReviewIds);
  const due = candidates.filter((c) => dueSet.has(c.id)).sort(byId)[0];
  if (due) return { puzzleId: due.id, reason: "due_review", theme: due.theme, difficulty: due.difficulty, contentStatus };

  // 2) weakness practice (unsolved, theme is a weakness)
  const wset = new Set(input.weaknessThemes);
  const weak = candidates.filter((c) => !c.solved && wset.has(c.theme)).sort(byId)[0];
  if (weak) return { puzzleId: weak.id, reason: "weakness", theme: weak.theme, difficulty: weak.difficulty, contentStatus };

  // 3) progression: unsolved closest to target difficulty (then easier), deterministic
  const unsolved = candidates.filter((c) => !c.solved);
  if (unsolved.length) {
    const target = BAND_RANK[input.targetBand];
    const pick = unsolved.slice().sort((a, b) => {
      const da = Math.abs(BAND_RANK[a.difficulty] - target), db = Math.abs(BAND_RANK[b.difficulty] - target);
      return (da - db) || (BAND_RANK[a.difficulty] - BAND_RANK[b.difficulty]) || (a.id - b.id);
    })[0];
    return { puzzleId: pick.id, reason: input.hasHistory ? "progression" : "cold_start", theme: pick.theme, difficulty: pick.difficulty, contentStatus };
  }

  // 4) everything solved → recommend the easiest for review-style practice
  const easiest = candidates.slice().sort((a, b) => (BAND_RANK[a.difficulty] - BAND_RANK[b.difficulty]) || (a.id - b.id))[0];
  return { puzzleId: easiest.id, reason: "progression", theme: easiest.theme, difficulty: easiest.difficulty, contentStatus };
}

// Cold-start target: start easy; otherwise aim near the player's demonstrated level.
export function targetBandFromScore(score: number, sufficient: boolean): DifficultyBand {
  if (!sufficient) return "easy";
  if (score < 40) return "easy";
  if (score < 60) return "medium";
  if (score < 80) return "hard";
  return "expert";
}
