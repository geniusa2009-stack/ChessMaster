import { test } from "node:test";
import assert from "node:assert/strict";
import { isLegalLine, isForcedMateInPlies, validatePuzzle, findDuplicates, normalizedPosition,
  difficultyScore, difficultyBand, matePliesForTheme } from "../src/features/content/lib/validate.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Load the server-only puzzle data WITHOUT importing the module (it runs `import "server-only"`
// which throws outside the Next bundler). Parsing the file is the test-safe way to gate content.
const _src = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(_src.slice(_src.indexOf("[{"), _src.indexOf("}]") + 2)) as { id: number; fen: string; solution: string[]; theme: string; elo: number }[];
import { OPENINGS, canonicalLine } from "../src/features/openings/lib/data.ts";
import { Chess } from "chess.js";

// ---- validator correctness ----
test("forced-mate solver: recognises a real mate-in-1 and rejects a non-forced position", () => {
  // Back-rank mate in 1: Re8#
  assert.equal(isForcedMateInPlies("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", 1), true);
  // Start position is not a forced mate in 1/3
  assert.equal(isForcedMateInPlies("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 3), false);
});
test("isLegalLine rejects an illegal move", () => {
  assert.equal(isLegalLine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e2e4"]), true);
  assert.equal(isLegalLine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", ["e2e5"]), false);
});
test("matePliesForTheme maps mateIn2->3, mateIn3->5", () => {
  assert.equal(matePliesForTheme("mateIn2", 3), 3);
  assert.equal(matePliesForTheme("mateIn3", 5), 5);
  assert.equal(matePliesForTheme("fork", 1), null);
});
test("validatePuzzle flags a non-forced-mate puzzle (the removed #3 position)", () => {
  const broken = { id: 3, fen: "5b1r/2knR3/2P5/5ppp/8/1Q6/3PPPPP/1NB1KBNR w K - 5 18", solution: ["e7d7", "c7c8", "b3b7"], theme: "mateIn2", elo: 1635 };
  assert.equal(validatePuzzle(broken).ok, false);
});

// ---- difficulty is deterministic + monotonic in depth ----
test("difficulty is deterministic and increases with solution depth", () => {
  const base = { id: 1, fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", theme: "x", elo: 1500 };
  const a = difficultyScore({ ...base, solution: ["e2e4"] });
  const b = difficultyScore({ ...base, solution: ["e2e4", "e7e5", "g1f3"] });
  assert.equal(a, difficultyScore({ ...base, solution: ["e2e4"] })); // deterministic
  assert.ok(b > a, "more plies => harder");
  assert.ok(["easy", "medium", "hard", "expert"].includes(difficultyBand(a)));
});

// ---- dedup ----
test("findDuplicates catches identical normalized positions, ignores move counters", () => {
  const dups = findDuplicates([
    { id: 1, fen: "8/8/8/8/8/8/8/4k2K w - - 0 1", solution: [], theme: "x", elo: 1 },
    { id: 2, fen: "8/8/8/8/8/8/8/4k2K w - - 9 40", solution: [], theme: "x", elo: 1 }, // same position, diff counters
  ]);
  assert.deepEqual(dups, [[2, 1]]);
  assert.equal(normalizedPosition("8/8/8/8/8/8/8/4k2K w - - 9 40"), "8/8/8/8/8/8/8/4k2K w - -");
});

// ---- CONTENT INTEGRITY GATE (R4): every active puzzle is legal; mate-themed puzzles are forced
// mates of their declared length; structure/metadata is well-formed; no duplicates ship. ----
const DOMAINS = ["tactical_vision", "calculation", "checkmate_patterns", "defensive_play", "endgame", "opening_knowledge"];
const DIFFS = ["easy", "medium", "hard", "expert"];
type P4 = { id: number; fen: string; solution: string[]; theme: string; elo: number; domain?: string; difficulty?: string; origin?: string; verification?: string };
import { Chess as _Chess } from "chess.js";
test("every ACTIVE puzzle has a legal solution line; every mate ends in checkmate", () => {
  for (const p of PUZZLES as P4[]) {
    assert.ok(isLegalLine(p.fen, p.solution), `puzzle #${p.id} has an illegal solution line`);
    assert.ok(p.solution.length >= 1, `puzzle #${p.id} has an empty solution`);
    if (/^mateIn\d+$/i.test(p.theme)) {
      const g = new _Chess(p.fen);
      for (const u of p.solution) g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" });
      assert.ok(g.isCheckmate(), `mate puzzle #${p.id} does not end in checkmate`);
    }
  }
});
// NOTE: the full-width FORCED-mate proof for the hand-authored mates lives in
// tests/content-authored-mates.test.ts — it is allocation-heavy (deep AND/OR search) and is split
// into its own runner invocation so each test process stays within the environment's time budget.
// It is NOT weakened, only relocated.
const ORIGINS = ["project_authored", "programmatically_generated", "imported_licensed", "public_domain", "user_provided", "unknown"];
const VERIFS = ["engine_verified", "automated_rule_verified", "legal_move_validation", "human_reviewed", "multiple_methods"];
test("every puzzle carries well-formed metadata, with origin SEPARATE from verification", () => {
  for (const p of PUZZLES as P4[]) {
    assert.ok(p.domain && DOMAINS.includes(p.domain), `#${p.id} bad/missing domain: ${p.domain}`);
    assert.ok(p.difficulty && DIFFS.includes(p.difficulty), `#${p.id} bad/missing difficulty: ${p.difficulty}`);
    assert.ok(p.origin && ORIGINS.includes(p.origin), `#${p.id} bad/missing origin: ${p.origin}`);
    assert.ok(p.verification && VERIFS.includes(p.verification), `#${p.id} bad/missing verification: ${p.verification}`);
  }
});
test("no imported/licensed/public-domain origin is claimed without a source (none are shipped)", () => {
  // We ship only authored + generated content; claiming imported/licensed/public-domain would
  // require a source record we do not have. Assert none is claimed, so no fabricated provenance.
  for (const p of PUZZLES as P4[]) {
    assert.ok(!["imported_licensed", "public_domain", "user_provided"].includes(p.origin!),
      `#${p.id} claims external origin ${p.origin} with no source evidence`);
  }
});
test("no duplicate / near-duplicate puzzle positions ship", () => {
  assert.deepEqual(findDuplicates(PUZZLES), []);
});
test("production corpus meets the R4 target (>=200 verified) and excludes broken #3", () => {
  assert.ok(PUZZLES.length >= 200, `expected >=200 production puzzles, got ${PUZZLES.length}`);
  assert.equal(PUZZLES.some((p) => p.id === 3), false);
});
test("all six training domains have production content", () => {
  const present = new Set((PUZZLES as P4[]).map((p) => p.domain));
  for (const d of DOMAINS) assert.ok(present.has(d), `domain ${d} has no content`);
});

// ---- opening lines remain legal (content-integrity for openings) ----
test("every opening canonical line is legal and reconstructs", () => {
  for (const o of OPENINGS) {
    const c = new Chess();
    for (const uci of canonicalLine(o)) {
      const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
      assert.ok(mv, `opening ${o.id} illegal move ${uci}`);
    }
  }
});
