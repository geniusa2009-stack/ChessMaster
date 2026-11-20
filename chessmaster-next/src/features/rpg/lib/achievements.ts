// Achievement catalog + condition evaluators. Unlocks are decided server-side from
// authoritative stats — the client can never assert "unlocked: true". No XP is granted
// by achievements (parity with legacy earnBadge, which only showed a medal).
export interface AchievementStats {
  puzzleSolveCount: number;
  wins: number;
  masteredOpenings: number;
}

export interface AchievementDef {
  key: string;
  title: string;
  condition: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { key: "puzzles_1", title: "First Blood", condition: (s) => s.puzzleSolveCount >= 1 },
  { key: "puzzles_3", title: "Getting Sharp", condition: (s) => s.puzzleSolveCount >= 3 },
  { key: "puzzles_10", title: "Tactician", condition: (s) => s.puzzleSolveCount >= 10 },
  { key: "puzzles_25", title: "Puzzle Master", condition: (s) => s.puzzleSolveCount >= 25 },
  { key: "first_win", title: "First Victory", condition: (s) => s.wins >= 1 },
  { key: "opening_master", title: "Theory Student", condition: (s) => s.masteredOpenings >= 1 },
];

// Returns the keys the user currently QUALIFIES for (server intersects with already-earned).
export function evaluateAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENT_DEFS.filter((a) => a.condition(stats)).map((a) => a.key);
}
