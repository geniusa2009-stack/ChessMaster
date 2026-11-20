import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAttempt, puzzleXp, nextPlayerMove, playerSlots } from "../src/features/puzzles/lib/validate.ts";
import { puzzleAttemptSchema } from "../src/lib/validation/schemas.ts";

// Puzzle 1 legacy line: player g2g3, opponent f4g4, player h2h3# (mate in 2)
const SOL = ["g2g3", "f4g4", "h2h3"];

test("first correct player move -> progress + correct opponent reply", () => {
  const r = validateAttempt(SOL, ["g2g3"]);
  assert.equal(r.status, "progress");
  assert.equal(r.opponentMove, "f4g4");
  assert.equal(r.solved, false);
});

test("full correct line -> solved", () => {
  const r = validateAttempt(SOL, ["g2g3", "h2h3"]);
  assert.equal(r.status, "solved");
  assert.equal(r.solved, true);
});

test("wrong first move -> wrong at index 0", () => {
  const r = validateAttempt(SOL, ["a2a3"]);
  assert.equal(r.status, "wrong");
  assert.equal(r.correctThrough, 0);
});

test("right then wrong -> wrong at index 1", () => {
  const r = validateAttempt(SOL, ["g2g3", "a2a3"]);
  assert.equal(r.status, "wrong");
  assert.equal(r.correctThrough, 1);
});

test("case/whitespace-insensitive move matching", () => {
  const r = validateAttempt(SOL, [" G2G3 "]);
  assert.equal(r.status, "progress");
});

test("playerSlots + XP formula ported (max(15, round(elo/55)))", () => {
  assert.equal(playerSlots(SOL), 2);
  assert.equal(puzzleXp(1651), Math.max(15, Math.round(1651 / 55)));
  assert.equal(puzzleXp(200), 15); // floor at 15
});

test("hint reveals only the NEXT player move, not the whole solution", () => {
  assert.deepEqual(nextPlayerMove(SOL, 0), { from: "g2", to: "g3" });
  assert.deepEqual(nextPlayerMove(SOL, 1), { from: "h2", to: "h3" });
  assert.equal(nextPlayerMove(SOL, 2), null);
});

test("attempt payload strips injected xp/score/streak/puzzleRating", () => {
  const parsed = puzzleAttemptSchema.parse({
    puzzleId: 1, playerMoves: ["g2g3"],
    xp: 999999, score: 999999, streak: 999, puzzleRating: 4000, alreadySolved: false,
  }) as Record<string, unknown>;
  assert.equal("xp" in parsed, false);
  assert.equal("score" in parsed, false);
  assert.equal("streak" in parsed, false);
  assert.equal("puzzleRating" in parsed, false);
  assert.deepEqual(parsed.playerMoves, ["g2g3"]);
});

test("malformed puzzle attempts are rejected", () => {
  assert.equal(puzzleAttemptSchema.safeParse({ puzzleId: 0, playerMoves: ["g2g3"] }).success, false);
  assert.equal(puzzleAttemptSchema.safeParse({ puzzleId: 1, playerMoves: [] }).success, false);
  assert.equal(puzzleAttemptSchema.safeParse({ puzzleId: 1, playerMoves: ["notamove"] }).success, false);
  assert.equal(puzzleAttemptSchema.safeParse({ puzzleId: 1, playerMoves: ["e2e4e5"] }).success, false);
});
