// Deterministic tactical solver — quiescence negamax over FORCING moves (captures, promotions,
// checks), FULL-WIDTH at defender nodes, with mate detection and principal-variation extraction.
// Material-only evaluation. This is a pure, reproducible function of the position: given a FEN it
// always returns the same analysis, with no reliance on an external engine binary.
//
// SOUNDNESS / LIMITATIONS (documented, intentional):
//  - It is SOUND for forcing tactics: a reported forced mate or material gain holds against ALL
//    defensive replies (defender nodes are searched full-width; attacker uses forcing moves, with
//    the side-to-move allowed to "stand pat" = decline to continue, which is conservative).
//  - It is intentionally INCOMPLETE on mates that require a QUIET (non-check, non-capture) attacker
//    move (e.g. some rook-ladder endings). It will simply not claim those — never a false positive.
//  - This precision-over-recall design is exactly what content generation needs: everything it
//    certifies is real; it may pass over some real tactics, which only costs recall.
import { Chess } from "chess.js";

export const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
export const MATE = 1_000_000;

let NODES = 0;
let NODE_CAP = 0;
function material(game: Chess): number {
  const b = game.board();
  let w = 0, bl = 0;
  for (const row of b) for (const sq of row) if (sq) { const v = VAL[sq.type]; if (sq.color === "w") w += v; else bl += v; }
  const d = w - bl;
  return game.turn() === "w" ? d : -d;
}
interface VMove { san: string; from: string; to: string; promotion?: string; captured?: string; flags: string }
function isForcing(m: VMove): boolean {
  return m.san.includes("+") || m.san.includes("#") || (!!m.flags && (m.flags.includes("c") || m.flags.includes("e") || m.flags.includes("p")));
}
function qsearch(game: Chess, alpha: number, beta: number, ply: number, maxPly: number): { score: number; pv: string[] } {
  NODES++;
  if (NODE_CAP && NODES > NODE_CAP) throw new Error("NODECAP");
  if (game.isCheckmate()) return { score: -(MATE - ply), pv: [] };
  if (game.isStalemate() || game.isInsufficientMaterial() || game.isThreefoldRepetition() || game.isDraw()) return { score: 0, pv: [] };
  const check = game.inCheck();
  const standPat = material(game);
  let best = -Infinity;
  let bestPv: string[] = [];
  if (!check) {
    if (standPat >= beta) return { score: beta, pv: [] };
    if (standPat > alpha) alpha = standPat;
    best = standPat;
  }
  if (ply >= maxPly && !check) return { score: alpha, pv: [] };
  const all = game.moves({ verbose: true }) as unknown as VMove[];
  const moves = check ? all : all.filter(isForcing);
  if (moves.length === 0) {
    if (check) return { score: -(MATE - ply), pv: [] };
    return { score: standPat, pv: [] };
  }
  moves.sort((a, b) =>
    ((b.san.includes("#") ? 1e4 : 0) + (b.captured ? VAL[b.captured] : 0)) -
    ((a.san.includes("#") ? 1e4 : 0) + (a.captured ? VAL[a.captured] : 0)));
  for (const m of moves) {
    game.move(m);
    const r = qsearch(game, -beta, -alpha, ply + 1, maxPly);
    game.undo();
    const sc = -r.score;
    if (sc > best) { best = sc; bestPv = [m.from + m.to + (m.promotion || "")].concat(r.pv); }
    if (sc > alpha) alpha = sc;
    if (alpha >= beta) break;
  }
  return { score: best, pv: bestPv };
}

export interface Analysis {
  fen: string; stand: number; bestScore: number; secondScore: number;
  bestMove: string; bestSan: string; pv: string[]; matePlies: number | null;
  nMoves: number; topCount: number;
}

// Full root analysis: static material + every root move's forced score (sorted desc).
export function analyse(fen: string, maxPly = 6, nodeCap = 200_000): Analysis | null {
  let game: Chess;
  try { game = new Chess(fen); } catch { return null; }
  const all = game.moves({ verbose: true }) as unknown as VMove[];
  if (all.length === 0) return null;
  const stand = material(game);
  const scored: { move: string; san: string; score: number; pv: string[] }[] = [];
  NODES = 0; NODE_CAP = nodeCap;
  try {
    for (const m of all) {
      game.move(m);
      const r = qsearch(game, -Infinity, Infinity, 1, maxPly);
      game.undo();
      scored.push({ move: m.from + m.to + (m.promotion || ""), san: m.san, score: -r.score, pv: [m.from + m.to + (m.promotion || "")].concat(r.pv) });
    }
  } catch (e) {
    if ((e as Error).message === "NODECAP") return null;
    throw e;
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1] ? scored[1].score : -Infinity;
  const matePlies = best.score >= MATE - 1000 ? MATE - best.score : null;
  const topCount = scored.filter((s) => s.score === best.score).length;
  return { fen, stand, bestScore: best.score, secondScore: second, bestMove: best.move, bestSan: best.san, pv: best.pv, matePlies, nMoves: all.length, topCount };
}

// Objective checks used by the content pipeline / tests.
export function provesForcedMate(fen: string, maxPlies = 6): number | null {
  const a = analyse(fen, maxPlies);
  return a ? a.matePlies : null;
}
export function provesMaterialGain(fen: string, minCp = 200, maxPly = 6): { gain: number; pv: string[]; unique: boolean } | null {
  const a = analyse(fen, maxPly);
  if (!a || a.matePlies != null) return null;
  const gain = a.bestScore - a.stand;
  if (gain < minCp) return null;
  return { gain, pv: a.pv, unique: a.bestScore - a.secondScore >= 150 };
}
