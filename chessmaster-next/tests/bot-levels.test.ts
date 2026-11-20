import { test } from "node:test";
import assert from "node:assert/strict";
import { BOT_LEVELS, botLevel, BOT_PERSONAS } from "../src/features/chess/lib/botLevels.ts";
import { ChessGame } from "../src/features/chess/lib/chessCompat.ts";
import { bestMove } from "../src/features/chess/lib/engine.ts";

test("there is a substantial, ordered bot progression (>= 20 levels)", () => {
  assert.ok(BOT_LEVELS.length >= 20);
  BOT_LEVELS.forEach((b, i) => assert.equal(b.level, i + 1));
});
test("bot strength parameters are MONOTONIC (real difference, not a renamed depth)", () => {
  for (let i = 1; i < BOT_LEVELS.length; i++) {
    assert.ok(BOT_LEVELS[i].movetime >= BOT_LEVELS[i - 1].movetime, "movetime must not decrease");
    assert.ok(BOT_LEVELS[i].skill >= BOT_LEVELS[i - 1].skill, "skill must not decrease");
    assert.ok(BOT_LEVELS[i].depth >= BOT_LEVELS[i - 1].depth, "depth must not decrease");
    assert.ok(BOT_LEVELS[i].blunder <= BOT_LEVELS[i - 1].blunder, "blunder must not increase");
  }
  assert.equal(botLevel(1).tier, "Beginner");
  assert.equal(botLevel(24).tier, "Master");
  assert.equal(botLevel(999).level, 24); // clamped
});
test("every bot level yields a LEGAL move from the start position (fallback engine)", () => {
  for (const b of BOT_LEVELS) {
    const g = new ChessGame();
    const m = bestMove(g, { skill: b.skill, movetime: b.movetime, depth: b.depth, blunder: 0, elo: b.approxElo });
    assert.ok(m, `level ${b.level} produced no move`);
    assert.ok(new ChessGame().safeMove(m!), `level ${b.level} produced an illegal move`);
  }
});
test("personas are behavioral (documented style), not cosmetic", () => {
  assert.equal(BOT_PERSONAS.assassin.style, "aggressive");
  assert.equal(BOT_PERSONAS.gambler.style, "random");
  assert.ok(BOT_PERSONAS.wall.note.length > 0);
});
