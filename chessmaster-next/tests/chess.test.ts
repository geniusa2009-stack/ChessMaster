import { test } from "node:test";
import assert from "node:assert/strict";
import { ChessGame } from "../src/features/chess/lib/chessCompat.ts";
import { bestMove, evalWhiteCp } from "../src/features/chess/lib/engine.ts";
import { curLevel, levelFromElo, botById } from "../src/features/chess/lib/bots.ts";

test("legal move applies and switches turn", () => {
  const g = new ChessGame();
  assert.equal(g.turn(), "w");
  const mv = g.safeMove({ from: "e2", to: "e4" });
  assert.ok(mv);
  assert.equal(g.turn(), "b");
});

test("illegal move returns null (v1 would throw) and does not change turn", () => {
  const g = new ChessGame();
  const mv = g.safeMove({ from: "e2", to: "e5" });
  assert.equal(mv, null);
  assert.equal(g.turn(), "w");
});

test("fool's mate is detected as checkmate", () => {
  const g = new ChessGame();
  g.safeMove({ from: "f2", to: "f3" });
  g.safeMove({ from: "e7", to: "e5" });
  g.safeMove({ from: "g2", to: "g4" });
  g.safeMove({ from: "d8", to: "h4" });
  assert.ok(g.isCheckmate());
  assert.ok(g.isGameOver());
  // side to move is white -> white (player) lost
  assert.equal(g.outcome("w"), "loss");
});

test("stalemate is a draw, not a loss", () => {
  const g = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  assert.ok(g.isStalemate());
  assert.ok(g.isDraw());
  assert.equal(g.outcome("w"), "draw");
});

test("check (not mate) is detected", () => {
  const g = new ChessGame("4k3/8/8/8/7q/8/8/4K3 b - - 0 1");
  g.safeMove({ from: "h4", to: "e4" }); // queen checks the e1 king down the e-file
  assert.ok(g.isCheck());
  assert.ok(!g.isCheckmate()); // king can step aside
});

test("engine returns a legal move for the side to move", () => {
  const g = new ChessGame();
  const m = bestMove(g, curLevel("bolt"));
  assert.ok(m);
  const applied = g.safeMove(m!);
  assert.ok(applied, "engine move must be legal");
});

test("bot levels scale with elo (titan stronger than rooky)", () => {
  assert.ok(curLevel("titan").depth >= curLevel("rooky").depth);
  assert.equal(levelFromElo(2800).blunder, 0);
  assert.ok(levelFromElo(400).blunder > 0);
  assert.equal(botById("titan").elo, 2800);
});

test("eval bar is symmetric at the start (roughly balanced)", () => {
  const g = new ChessGame();
  assert.equal(evalWhiteCp(g), 0);
});

test("outcome is null while game is in progress (no premature reward)", () => {
  const g = new ChessGame();
  g.safeMove({ from: "e2", to: "e4" });
  assert.equal(g.outcome("w"), null);
});
