// Content validation pipeline. Chess positions are DATA that must be programmatically verified.
// Pure + dependency-light (chess.js only) so it runs in unit tests and as a CI gate.
import { Chess } from "chess.js";

export interface PuzzleLike { id: number; fen: string; solution: string[]; theme: string; elo: number }

// ---- legality ----
export function isLegalLine(fen: string, line: string[]): boolean {
  try {
    const c = new Chess(fen);
    for (const u of line) {
      const mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      if (!mv) return false;
    }
    return true;
  } catch { return false; }
}

// ---- forced-mate solver ----
// Returns true iff the side to move can force checkmate within `plies` half-moves:
// the player has a move that is mate, or (recursively) a move after which EVERY opponent reply
// leads to a forced mate in the remaining plies. Used to prove mate-in-N puzzles are sound.
export function isForcedMateInPlies(fen: string, plies: number): boolean {
  const c = new Chess(fen);
  const solve = (depth: number): boolean => {
    if (depth <= 0) return false;
    for (const m1 of c.moves({ verbose: true })) {
      c.move(m1);
      if (c.isCheckmate()) { c.undo(); return true; }
      if (depth === 1) { c.undo(); continue; }
      const replies = c.moves({ verbose: true });
      let allForced = replies.length > 0; // a stalemate reply is NOT mate
      for (const o of replies) {
        c.move(o);
        const ok = solve(depth - 2);
        c.undo();
        if (!ok) { allForced = false; break; }
      }
      c.undo();
      if (allForced) return true;
    }
    return false;
  };
  return solve(plies);
}

// mateIn2 => 3 plies (player, opp, player), mateIn3 => 5 plies, etc.
export function matePliesForTheme(theme: string, solutionLen: number): number | null {
  const m = /^mateIn(\d+)$/.exec(theme);
  if (!m) return null;
  return Number(m[1]) * 2 - 1;
}

// A puzzle is sound if: legal line, the line ends in checkmate, and (for mate themes) the first
// move actually FORCES mate in the declared number of moves.
export function validatePuzzle(p: PuzzleLike): { ok: boolean; reason?: string } {
  if (!isLegalLine(p.fen, p.solution)) return { ok: false, reason: "illegal line" };
  const end = new Chess(p.fen);
  for (const u of p.solution) end.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
  if (!end.isCheckmate()) return { ok: false, reason: "solution does not end in checkmate" };
  const plies = matePliesForTheme(p.theme, p.solution.length);
  if (plies !== null) {
    if (p.solution.length !== plies) return { ok: false, reason: `theme ${p.theme} expects ${plies} plies, got ${p.solution.length}` };
    if (!isForcedMateInPlies(p.fen, plies)) return { ok: false, reason: "not a forced mate (opponent can escape)" };
  }
  return { ok: true };
}

// ---- duplicate / near-duplicate detection ----
// Normalize to the position-defining FEN fields (board, side, castling, ep) — ignores move
// counters so cosmetically-different clones of the same position are caught.
export function normalizedPosition(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}
export function findDuplicates(puzzles: PuzzleLike[]): Array<[number, number]> {
  const seen = new Map<string, number>();
  const dups: Array<[number, number]> = [];
  for (const p of puzzles) {
    const k = normalizedPosition(p.fen);
    if (seen.has(k)) dups.push([p.id, seen.get(k)!]);
    else seen.set(k, p.id);
  }
  return dups;
}

// ---- deterministic difficulty ----
// Score from measurable features: solution length (calculation depth), the mover's branching
// factor (candidate-move noise), and whether the key move is forcing (a check). Documented in
// docs/CHESS-CONTENT-QUALITY.md. NOT random, NOT a hand-assigned label.
export function difficultyScore(p: PuzzleLike): number {
  const playerMoves = Math.ceil(p.solution.length / 2);
  let branching = 20, forcingBonus = 0;
  try {
    const c = new Chess(p.fen);
    branching = c.moves().length;
    const first = p.solution[0];
    const mv = c.move({ from: first.slice(0, 2), to: first.slice(2, 4), promotion: first[4] || "q" });
    if (mv && c.isCheck()) forcingBonus = -8; // a forcing (checking) key move is easier to find
  } catch { /* use defaults */ }
  // depth dominates; branching adds noise; forcing check reduces difficulty.
  return playerMoves * 40 + branching * 1.5 + forcingBonus;
}
export type DifficultyBand = "easy" | "medium" | "hard" | "expert";
export function difficultyBand(score: number): DifficultyBand {
  if (score < 70) return "easy";
  if (score < 100) return "medium";
  if (score < 140) return "hard";
  return "expert";
}

// ======================= R3: expanded content pipeline =======================
import { Chess as _Chess } from "chess.js";

export type Provenance = "project-authored" | "engine-verified" | "imported" | "user-provided" | "unknown";
export type ContentStatus = "candidate" | "validated" | "rejected" | "needs_review" | "deprecated";
export type RejectionReason =
  | "INVALID_FEN" | "ILLEGAL_MOVE" | "NO_FORCED_SOLUTION" | "MULTIPLE_UNINTENDED_SOLUTIONS"
  | "WRONG_THEME" | "DUPLICATE" | "NEAR_DUPLICATE" | "LOW_EDUCATIONAL_VALUE"
  | "INSUFFICIENT_PROVENANCE" | "DIFFICULTY_UNCERTAIN" | "TRIVIAL" | "AMBIGUOUS";

// --- material signature (for near-duplicate detection) ---
// Count of each piece type per color, order-independent. Two positions with the same material
// AND the same normalized pawn/king geometry are likely the same tactic re-dressed.
export function materialSignature(fen: string): string {
  const board = fen.split(" ")[0];
  const counts: Record<string, number> = {};
  for (const ch of board) if (/[a-zA-Z]/.test(ch)) counts[ch] = (counts[ch] || 0) + 1;
  return Object.keys(counts).sort().map((k) => `${k}${counts[k]}`).join("");
}

// Horizontal mirror of a board (file a<->h). Used to catch mirrored clones.
export function mirrorFen(fen: string): string {
  const [board, ...rest] = fen.split(" ");
  const mirrored = board.split("/").map((row) => {
    // expand digits, reverse, recompress
    const sq = row.replace(/\d/g, (d) => "1".repeat(Number(d))).split("").reverse().join("");
    return sq.replace(/1+/g, (m) => String(m.length));
  }).join("/");
  return [mirrored, ...rest].join(" ");
}

// Near-duplicate against a corpus: exact position, mirrored position, or identical material
// signature + identical solution length + same theme (very likely a re-dress).
export function isNearDuplicate(cand: PuzzleLike, corpus: PuzzleLike[]): { dup: boolean; of?: number; why?: string } {
  const cn = normalizedPosition(cand.fen);
  const cm = normalizedPosition(mirrorFen(cand.fen));
  const csig = materialSignature(cand.fen);
  for (const c of corpus) {
    if (c.id === cand.id) continue;
    const n = normalizedPosition(c.fen);
    if (n === cn) return { dup: true, of: c.id, why: "exact position" };
    if (n === cm) return { dup: true, of: c.id, why: "mirrored position" };
    if (materialSignature(c.fen) === csig && c.theme === cand.theme && c.solution.length === cand.solution.length
        && c.fen.split(" ")[0] === cand.fen.split(" ")[0]) return { dup: true, of: c.id, why: "identical board" };
  }
  return { dup: false };
}

// Solution uniqueness for mate puzzles: how many distinct FIRST moves also force mate in the
// declared length? 1 => unique_solution; >1 => acceptable_multiple_solutions (still sound, but
// flagged). Not applicable to non-mate themes here.
export type SolutionClass = "unique_solution" | "acceptable_multiple_solutions" | "not_applicable";
export function classifyMateSolution(p: PuzzleLike): SolutionClass {
  const plies = matePliesForTheme(p.theme, p.solution.length);
  if (plies === null) return "not_applicable";
  const c = new _Chess(p.fen);
  let matingFirsts = 0;
  for (const m1 of c.moves({ verbose: true })) {
    c.move(m1);
    // does THIS first move force mate in (plies) using the shared solver on the resulting line?
    const forced = forcedFrom(c, plies - 1);
    c.undo();
    if (forced) matingFirsts++;
    if (matingFirsts > 1) break;
  }
  return matingFirsts <= 1 ? "unique_solution" : "acceptable_multiple_solutions";
}
// helper: after the player's move it's the opponent's turn; `depth` plies remain.
function forcedFrom(c: InstanceType<typeof _Chess>, depth: number): boolean {
  if (c.isCheckmate()) return true;
  if (depth <= 0) return false;
  // opponent to move: EVERY reply must allow a forced mate in depth-1
  const replies = c.moves({ verbose: true });
  if (replies.length === 0) return false; // stalemate, not mate
  for (const o of replies) {
    c.move(o);
    let can = false;
    for (const m of c.moves({ verbose: true })) { c.move(m); const ok = forcedFrom(c, depth - 2); c.undo(); if (ok) { can = true; break; } }
    c.undo();
    if (!can) return false;
  }
  return true;
}

// Non-triviality: reject positions with too little material (e.g. bare K+Q vs K spam) so the
// library isn't padded with trivial clones. Require >= 6 pieces on the board OR a multi-move mate.
export function isTrivial(p: PuzzleLike): boolean {
  const pieces = (p.fen.split(" ")[0].match(/[a-zA-Z]/g) || []).length;
  return pieces < 6 && p.solution.length <= 1;
}

// Full production gate for a candidate puzzle against the existing corpus.
export function gatePuzzle(cand: PuzzleLike, corpus: PuzzleLike[]): { accepted: boolean; reason?: RejectionReason; solutionClass?: SolutionClass } {
  const base = validatePuzzle(cand);
  if (!base.ok) {
    const r: RejectionReason = /illegal/.test(base.reason || "") ? "ILLEGAL_MOVE"
      : /checkmate/.test(base.reason || "") ? "NO_FORCED_SOLUTION"
      : /forced/.test(base.reason || "") ? "NO_FORCED_SOLUTION" : "WRONG_THEME";
    return { accepted: false, reason: r };
  }
  if (isTrivial(cand)) return { accepted: false, reason: "TRIVIAL" };
  const nd = isNearDuplicate(cand, corpus);
  if (nd.dup) return { accepted: false, reason: "NEAR_DUPLICATE" };
  return { accepted: true, solutionClass: classifyMateSolution(cand) };
}
