import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRewards, validateResult, eloDelta } from "../src/lib/game/rewards.ts";

const base = {
  clientGameId: "00000000-0000-0000-0000-000000000000",
  opponentId: "titan", opponentElo: 2800, ranked: true, moves: 40, durationMs: 300000,
};

test("ranked win gives +30 xp and positive rating vs stronger foe", () => {
  const r = computeRewards({ rating: 1200, wins: 5 }, { ...base, result: "win" } as never);
  assert.equal(r.xpDelta, 30);
  assert.ok(r.ratingDelta > 0);
});

test("friendly win gives +15 xp and no rating change", () => {
  const r = computeRewards({ rating: 1200, wins: 5 }, { ...base, ranked: false, result: "win" } as never);
  assert.equal(r.xpDelta, 15);
  assert.equal(r.ratingDelta, 0);
});

test("ranked loss gives -10 xp", () => {
  const r = computeRewards({ rating: 1200, wins: 5 }, { ...base, result: "loss" } as never);
  assert.equal(r.xpDelta, -10);
});

test("first win + giant slayer achievements awarded", () => {
  const r = computeRewards({ rating: 1200, wins: 0 }, { ...base, result: "win" } as never);
  assert.deepEqual(r.achievements.sort(), ["first_win", "giant_slayer"]);
});

test("impossible result is rejected", () => {
  assert.ok(validateResult({ ...base, result: "win", moves: 0 } as never));
  assert.ok(validateResult({ ...base, result: "win", moves: 40, durationMs: 10 } as never));
  assert.equal(validateResult({ ...base, result: "win" } as never), null);
});

test("elo is symmetric-ish and bounded by K", () => {
  const d = eloDelta(1500, 1500, 1);
  assert.ok(d > 0 && d <= 24);
});
