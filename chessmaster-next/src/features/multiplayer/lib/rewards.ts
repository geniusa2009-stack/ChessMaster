// Multiplayer reward computation — REUSES the Elo helper from the chess phase (no second
// rating system). For a human-vs-human game both ratings move. XP mirrors the vs-bot scheme.
import { eloDelta } from "@/lib/game/rewards";
import type { Side } from "@/features/multiplayer/lib/clock";

export interface MpRewardInput {
  ranked: boolean;
  winner: Side | null; // null = draw
  whiteRating: number;
  blackRating: number;
}
export interface MpRewardResult {
  whiteRatingDelta: number; blackRatingDelta: number;
  whiteXpDelta: number; blackXpDelta: number;
}

export function computeMpRewards(i: MpRewardInput): MpRewardResult {
  const whiteScore = i.winner === "white" ? 1 : i.winner === "black" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;
  const wR = i.ranked ? eloDelta(i.whiteRating, i.blackRating, whiteScore) : 0;
  const bR = i.ranked ? eloDelta(i.blackRating, i.whiteRating, blackScore) : 0;
  const xp = (score: number) => (i.ranked ? (score === 1 ? 30 : score === 0 ? -10 : 0) : (score === 1 ? 15 : 0));
  return { whiteRatingDelta: wR, blackRatingDelta: bR, whiteXpDelta: xp(whiteScore), blackXpDelta: xp(blackScore) };
}
