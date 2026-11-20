import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { materialSignature, mirrorFen, isNearDuplicate, classifyMateSolution, isTrivial, gatePuzzle,
  type PuzzleLike } from "../src/features/content/lib/validate.ts";

const PUZZLES = JSON.parse(
  (() => { const s = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
    return s.slice(s.indexOf("[{"), s.indexOf("}]") + 2); })()
) as Array<PuzzleLike & { origin?: string; verification?: string }>;

// ---- material signature + mirror ----
test("material signature is order-independent and distinguishes material", () => {
  assert.equal(materialSignature("8/8/8/8/8/8/8/R3K2r w - - 0 1"), materialSignature("8/8/8/8/8/8/8/r2KR3 w - - 0 1"));
  assert.notEqual(materialSignature("8/8/8/8/8/8/8/4K2R w - - 0 1"), materialSignature("8/8/8/8/8/8/8/4K2Q w - - 0 1"));
});
test("mirrorFen reflects files (a<->h)", () => {
  assert.equal(mirrorFen("6k1/8/8/8/8/8/8/R5K1 w - - 0 1").split(" ")[0], "1k6/8/8/8/8/8/8/1K5R");
});

// ---- near-duplicate detection ----
test("near-duplicate catches exact, mirrored and identical-board clones", () => {
  const a: PuzzleLike = { id: 1, fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["e1e8"], theme: "mateIn1", elo: 900 };
  const exact: PuzzleLike = { ...a, id: 2 };
  assert.equal(isNearDuplicate(exact, [a]).dup, true);
  const mirror: PuzzleLike = { id: 3, fen: mirrorFen(a.fen), solution: ["d1d8"], theme: "mateIn1", elo: 900 };
  assert.equal(isNearDuplicate(mirror, [a]).dup, true);
  const different: PuzzleLike = { id: 4, fen: "7k/5ppp/8/8/8/8/8/R6K w - - 0 1", solution: ["a1a8"], theme: "mateIn1", elo: 900 };
  assert.equal(isNearDuplicate(different, [a]).dup, false);
});

// ---- trivial rejection ----
test("bare K+Q mate-in-1 spam is flagged trivial; richer positions are not", () => {
  assert.equal(isTrivial({ id: 1, fen: "k7/8/KQ6/8/8/8/8/8 w - - 0 1", solution: ["b6b7"], theme: "mateIn1", elo: 1 }), true);
  assert.equal(isTrivial({ id: 2, fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["e1e8"], theme: "mateIn1", elo: 900 }), false);
});

// ---- solution uniqueness classifier ----
test("classifyMateSolution distinguishes unique vs multiple mating first moves", () => {
  assert.equal(classifyMateSolution({ id: 1, fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", solution: ["e1e8"], theme: "mateIn1", elo: 900 }), "unique_solution");
});

// ---- full gate rejects a known-bad candidate, accepts a verified one ----
test("gatePuzzle rejects a non-forced-mate candidate and accepts a verified distinct one", () => {
  const bad: PuzzleLike = { id: 99, fen: "5b1r/2knR3/2P5/5ppp/8/1Q6/3PPPPP/1NB1KBNR w K - 5 18", solution: ["e7d7", "c7c8", "b3b7"], theme: "mateIn2", elo: 1635 };
  assert.equal(gatePuzzle(bad, PUZZLES).accepted, false);
  const good: PuzzleLike = { id: 100, fen: "6k1/5ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1", solution: ["c1c8"], theme: "mateIn1", elo: 900 };
  assert.equal(gatePuzzle(good, PUZZLES).accepted, true); // verified forced mate, distinct board
});

// ---- origin + verification present, kept separate, no fabricated sources ----
test("every production puzzle records origin AND verification separately, with no fabricated source", () => {
  for (const p of PUZZLES) {
    assert.ok(["project_authored", "programmatically_generated", "imported_licensed", "public_domain", "user_provided", "unknown"].includes(p.origin!), `#${p.id} bad origin`);
    assert.ok(["engine_verified", "automated_rule_verified", "legal_move_validation", "human_reviewed", "multiple_methods"].includes(p.verification!), `#${p.id} bad verification`);
    // engine verification must not be used AS an origin
    assert.notEqual(p.origin as string, "engine_verified", `#${p.id} conflates verification with origin`);
  }
});
