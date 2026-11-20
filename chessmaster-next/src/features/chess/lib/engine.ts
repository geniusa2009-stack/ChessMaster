// Pure negamax engine ported from the old app's fallback AI. Runs client-side for
// gameplay ONLY — it never touches XP/rating/rewards (those are server-authoritative).
import { ChessGame } from "@/features/chess/lib/chessCompat";
import type { EngineLevel, MoveLite } from "@/features/chess/types";

const VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Material evaluation from the side-to-move's perspective.
export function evalSide(g: ChessGame): number {
  if (g.isCheckmate()) return -100000;
  if (g.isDraw() || g.isStalemate()) return 0;
  const board = g.board();
  let white = 0, black = 0;
  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue;
      const v = VALUES[sq.type] || 0;
      if (sq.color === "w") white += v; else black += v;
    }
  }
  const score = white - black;
  return g.turn() === "w" ? score : -score;
}

interface NegamaxCtx { deadline: number }

function negamax(g: ChessGame, depth: number, a: number, b: number, ctx: NegamaxCtx): number {
  if (depth <= 0 || g.isGameOver()) return evalSide(g);
  if (ctx.deadline && Date.now() > ctx.deadline) return evalSide(g);
  let best = -Infinity;
  for (const m of g.verboseMoves()) {
    g.safeMove(m);
    const s = -negamax(g, depth - 1, -b, -a, ctx);
    g.undo();
    if (s > best) best = s;
    if (best > a) a = best;
    if (a >= b) break;
  }
  return best === -Infinity ? evalSide(g) : best;
}

// Best move for the side to move at a given depth. Returns UCI-ish move or null.
export function bestMove(g: ChessGame, level: EngineLevel): MoveLite | null {
  const moves = g.verboseMoves();
  if (!moves.length) return null;

  // Occasional deliberate blunder to emulate weaker bots (ported behavior).
  if (level.blunder > 0 && Math.random() < level.blunder) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const ctx: NegamaxCtx = { deadline: Date.now() + Math.max(120, Math.min(1200, level.movetime * 2)) };
  let best: MoveLite | null = null;
  let bs = -Infinity;
  for (const m of moves) {
    g.safeMove(m);
    const s = -negamax(g, Math.max(1, level.depth) - 1, -1e9, 1e9, ctx);
    g.undo();
    if (s > bs) { bs = s; best = m; }
    if (Date.now() > ctx.deadline) break;
  }
  return best ?? moves[0];
}

// White-centric centipawn eval for an eval bar (ported from evalWhiteCp intent).
export function evalWhiteCp(g: ChessGame): number {
  if (g.isCheckmate()) return g.turn() === "w" ? -100000 : 100000;
  if (g.isDraw() || g.isStalemate()) return 0;
  const s = evalSide(g);
  return g.turn() === "w" ? s : -s;
}
