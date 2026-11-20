// Pure completion validation for the openings trainer. The server replays the player's
// submitted line against the canonical opening line — completion is NOT client-trusted.
import type { Opening } from "@/features/openings/lib/data";
import { canonicalLine } from "@/features/openings/lib/data";

export const OPENING_XP = 8;              // ported from legacy opMastered() addXP(8)
export const MASTERED_FOR_SILVER = 5;     // ported: 5 flawless openings -> silver cert

export interface CompletionCheck { complete: boolean; reason?: string }

const norm = (u: string) => (u || "").trim().toLowerCase();

// The submitted line must EXACTLY equal the canonical opening line.
export function validateCompletion(opening: Opening, submittedMoves: string[]): CompletionCheck {
  const line = canonicalLine(opening);
  if (submittedMoves.length !== line.length) {
    return { complete: false, reason: "line length mismatch" };
  }
  for (let i = 0; i < line.length; i++) {
    if (norm(submittedMoves[i]) !== norm(line[i])) {
      return { complete: false, reason: `move ${i} mismatch` };
    }
  }
  return { complete: true };
}

// Trap lookup used by the client to show the punishment demo (public data).
export function findTrap(opening: Opening, moveIndex: number, uci: string) {
  return (opening.traps || []).find(
    (t) => t.moveIndex === moveIndex && (t.wrongMove === uci || t.wrongMove.slice(0, 4) === uci.slice(0, 4))
  );
}
