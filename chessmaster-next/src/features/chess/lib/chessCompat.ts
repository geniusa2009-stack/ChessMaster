// Compatibility layer over chess.js v1. The old app used chess.js 0.10.3 whose API
// differed (game_over/in_checkmate/... and move() returning null on illegal moves).
// This isolates the migration to one place instead of leaking hacks across the UI.
import { Chess } from "chess.js";
import type { Color, Square, MoveLite } from "@/features/chess/types";

export class ChessGame {
  private c: Chess;
  constructor(fen?: string) {
    this.c = fen ? new Chess(fen) : new Chess();
  }
  fen(): string { return this.c.fen(); }
  turn(): Color { return this.c.turn() as Color; }
  history(): string[] { return this.c.history(); }
  board() { return this.c.board(); }
  get(sq: Square) { return this.c.get(sq as never); }
  isGameOver(): boolean { return this.c.isGameOver(); }
  isCheckmate(): boolean { return this.c.isCheckmate(); }
  isStalemate(): boolean { return this.c.isStalemate(); }
  isDraw(): boolean { return this.c.isDraw(); }
  isCheck(): boolean { return this.c.isCheck(); }

  // v1 throws on illegal moves; the old code relied on null. Restore null-on-illegal.
  safeMove(m: { from: Square; to: Square; promotion?: string }): MoveLite | null {
    try {
      const mv = this.c.move({ from: m.from, to: m.to, promotion: m.promotion ?? "q" });
      return mv
        ? { from: mv.from, to: mv.to, promotion: mv.promotion, color: mv.color as Color, captured: mv.captured, san: mv.san, flags: mv.flags }
        : null;
    } catch {
      return null;
    }
  }

  moves(opts?: { square?: Square; verbose?: boolean }) {
    return this.c.moves(opts as never) as never;
  }
  verboseMoves(square?: Square) {
    return this.c.moves({ square: square as never, verbose: true }) as unknown as MoveLite[];
  }
  undo() { return this.c.undo(); }
  clone(): ChessGame { return new ChessGame(this.c.fen()); }

  // Result from the mover's perspective is derived HERE (client gameplay only).
  outcome(playerColor: Color): "win" | "loss" | "draw" | null {
    if (!this.c.isGameOver()) return null;
    if (this.c.isCheckmate()) {
      // side to move is checkmated -> the other side won
      return this.c.turn() === playerColor ? "loss" : "win";
    }
    return "draw"; // stalemate / insufficient material / 50-move / repetition
  }
}
