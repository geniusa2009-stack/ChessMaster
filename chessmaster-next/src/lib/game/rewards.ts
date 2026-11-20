// Server-authoritative progression. Ported from the old client `endGame()`:
//   win  -> +30 XP ranked / +15 friendly
//   loss -> -10 XP (ranked only)
//   draw ->  0
// Ranked games also adjust Elo rating. All of this runs on the server; the client
// never supplies XP or rating deltas.
import type { GameResult } from "@/lib/validation/schemas";

export interface RewardOutcome {
  xpDelta: number;
  ratingDelta: number;
  achievements: string[];
}

const K = 24; // Elo K-factor

export function eloDelta(playerRating: number, opponentElo: number, score: number): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - playerRating) / 400));
  return Math.round(K * (score - expected));
}

// Basic plausibility gate. Returns a reason string if the report is impossible.
export function validateResult(r: GameResult): string | null {
  if (r.moves === 0 && r.result !== "draw") return "no moves but decisive result";
  if (r.result !== "draw" && r.moves < 2) return "decisive result with too few moves";
  if (r.durationMs < r.moves * 50) return "duration too short for move count";
  return null;
}

export function computeRewards(
  current: { rating: number; wins: number },
  r: GameResult
): RewardOutcome {
  const score = r.result === "win" ? 1 : r.result === "draw" ? 0.5 : 0;
  let xpDelta = 0;
  if (r.result === "win") xpDelta = r.ranked ? 30 : 15;
  else if (r.result === "loss" && r.ranked) xpDelta = -10;

  const ratingDelta = r.ranked ? eloDelta(current.rating, r.opponentElo, score) : 0;

  const achievements: string[] = [];
  if (r.result === "win" && current.wins === 0) achievements.push("first_win");
  if (r.result === "win" && r.opponentElo >= 2000) achievements.push("giant_slayer");

  return { xpDelta, ratingDelta, achievements };
}
