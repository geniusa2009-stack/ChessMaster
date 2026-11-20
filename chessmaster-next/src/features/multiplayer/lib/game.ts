// Server-side move authority for multiplayer, built on the shared chess.js compat layer.
// The client's FEN / result / winner claims are NEVER trusted — the server reconstructs
// state from the stored FEN and validates the move.
import { ChessGame } from "@/features/chess/lib/chessCompat";
import type { Side } from "@/features/multiplayer/lib/clock";

export type Termination = "checkmate" | "stalemate" | "draw" | "resign" | "timeout";

export interface MoveOutcome {
  ok: boolean;
  reason?: "INVALID_MOVE";
  fen?: string;
  turn?: Side;
  finished?: boolean;
  winner?: Side | null;   // null on draw
  isDraw?: boolean;
  termination?: Termination;
  san?: string;
}

const sideOf = (c: "w" | "b"): Side => (c === "w" ? "white" : "black");

// Validate + apply a UCI move to the authoritative FEN. Returns the new authoritative state.
export function applyServerMove(fen: string, uci: string): MoveOutcome {
  const g = new ChessGame(fen);
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promotion = uci.slice(4) || undefined;
  const mv = g.safeMove({ from, to, promotion });
  if (!mv) return { ok: false, reason: "INVALID_MOVE" };

  let finished = false, winner: Side | null = null, isDraw = false, termination: Termination | undefined;
  if (g.isGameOver()) {
    finished = true;
    if (g.isCheckmate()) { winner = sideOf(mv.color); termination = "checkmate"; } // mover delivered mate
    else if (g.isStalemate()) { isDraw = true; termination = "stalemate"; }
    else { isDraw = true; termination = "draw"; }
  }
  return { ok: true, fen: g.fen(), turn: g.turn() === "w" ? "white" : "black", finished, winner, isDraw, termination, san: mv.san };
}

// Whose turn does a FEN encode? (server derives; never trusts client)
export function turnFromFen(fen: string): Side {
  return new ChessGame(fen).turn() === "w" ? "white" : "black";
}
