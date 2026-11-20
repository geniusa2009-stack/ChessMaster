import { test } from "node:test";
import assert from "node:assert/strict";
import { gameResultSchema } from "../src/lib/validation/schemas.ts";

// The server computes XP/rating. Even if an attacker injects xp/rating/role/achievements
// into the /api/games payload, the zod schema must DROP them so they can never be trusted.
test("injected xp/rating/role/achievements are stripped from the game-result payload", () => {
  const malicious = {
    clientGameId: "00000000-0000-0000-0000-000000000000",
    opponentId: "rooky", opponentElo: 400, result: "win", ranked: true,
    moves: 20, durationMs: 60000,
    xp: 999999, rating: 4000, role: "admin", achievements: ["gold"], xpDelta: 999999,
  };
  const parsed = gameResultSchema.parse(malicious) as Record<string, unknown>;
  assert.equal("xp" in parsed, false);
  assert.equal("rating" in parsed, false);
  assert.equal("role" in parsed, false);
  assert.equal("achievements" in parsed, false);
  assert.equal("xpDelta" in parsed, false);
  // legitimate fields survive
  assert.equal(parsed.result, "win");
  assert.equal(parsed.opponentElo, 400);
});

test("malformed result values are rejected", () => {
  const bad = { clientGameId: "not-a-uuid", opponentId: "x", opponentElo: 400, result: "win", ranked: true, moves: 1, durationMs: 1 };
  assert.equal(gameResultSchema.safeParse(bad).success, false);
  const badResult = { clientGameId: "00000000-0000-0000-0000-000000000000", opponentId: "x", opponentElo: 400, result: "cheated", ranked: true, moves: 1, durationMs: 1 };
  assert.equal(gameResultSchema.safeParse(badResult).success, false);
});
