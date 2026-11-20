// Pure puzzle-attempt validation. Takes the (server-held) solution and the player's
// moves and decides progress/solved/wrong. No secrets, no I/O — unit-testable.
//
// Solution layout (ported from legacy): alternating UCI moves,
//   even indices (0,2,4,...) = player moves, odd indices = opponent replies.
export type AttemptStatus = "progress" | "solved" | "wrong";

export interface AttemptResult {
  status: AttemptStatus;
  correctThrough: number;   // number of player moves accepted
  opponentMove?: string;    // reply to play after a correct (non-final) player move
  solved: boolean;
}

export function playerSlots(solution: string[]): number {
  return Math.ceil(solution.length / 2);
}

export function validateAttempt(solution: string[], playerMoves: string[]): AttemptResult {
  const needed = playerSlots(solution);
  // Validate each player move against its solution slot (index 2*i).
  for (let i = 0; i < playerMoves.length; i++) {
    if (norm(playerMoves[i]) !== norm(solution[2 * i] ?? "")) {
      return { status: "wrong", correctThrough: i, solved: false };
    }
  }
  const k = playerMoves.length;
  if (k >= needed) {
    return { status: "solved", correctThrough: k, solved: true };
  }
  const opponentMove = solution[2 * k - 1]; // reply after the k-th correct player move
  return { status: "progress", correctThrough: k, opponentMove, solved: false };
}

// XP formula ported verbatim from the legacy pzVictory(): max(15, round(elo/55)).
export function puzzleXp(elo: number): number {
  return Math.max(15, Math.round(elo / 55));
}

// Next expected player move (for a server-issued hint). Returns from/to squares.
export function nextPlayerMove(solution: string[], playerMovesCount: number): { from: string; to: string } | null {
  const uci = solution[2 * playerMovesCount];
  if (!uci) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function norm(uci: string): string {
  return (uci || "").trim().toLowerCase();
}
