import { test } from "node:test";
import assert from "node:assert/strict";
import { levelFromXp, xpIntoLevel, tierFromXp, XP_PER_LEVEL } from "../src/lib/progression/level.ts";
import { QUEST_DEFS, questDef, isQuestComplete, utcDateStr } from "../src/features/rpg/lib/quests.ts";
import { evaluateAchievements } from "../src/features/rpg/lib/achievements.ts";
import { perkDef, PERK_DEFS } from "../src/features/rpg/lib/perks.ts";
import { questClaimSchema, perkBuySchema } from "../src/lib/validation/schemas.ts";

// ---- level / tier (ported formulas) ----
test("level = 1 + floor(xp/100), boundaries exact", () => {
  assert.equal(XP_PER_LEVEL, 100);
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(250), 3);
  assert.equal(xpIntoLevel(250), 50);
});
test("tier thresholds ported (100/300/600)", () => {
  assert.equal(tierFromXp(0).key, "bronze");
  assert.equal(tierFromXp(99).key, "bronze");
  assert.equal(tierFromXp(100).key, "silver");
  assert.equal(tierFromXp(300).key, "gold");
  assert.equal(tierFromXp(600).key, "diamond");
});

// ---- quests ----
test("quest defs ported (play 2 / puzzles 5 / openings 1, +50)", () => {
  assert.equal(QUEST_DEFS.length, 3);
  assert.equal(questDef("play")!.target, 2);
  assert.equal(questDef("puzzles")!.target, 5);
  assert.equal(questDef("openings")!.target, 1);
  QUEST_DEFS.forEach((q) => assert.equal(q.reward, 50));
});
test("quest completion is threshold-based", () => {
  const q = questDef("puzzles")!;
  assert.equal(isQuestComplete(q, 4), false);
  assert.equal(isQuestComplete(q, 5), true);
  assert.equal(isQuestComplete(q, 9), true);
});
test("utcDateStr is a UTC YYYY-MM-DD", () => {
  assert.match(utcDateStr(new Date("2026-09-28T23:59:59Z")), /^2026-09-28$/);
});

// ---- achievements (evaluated from authoritative stats) ----
test("achievement unlocks derive from stats, not client claims", () => {
  assert.deepEqual(evaluateAchievements({ puzzleSolveCount: 0, wins: 0, masteredOpenings: 0 }), []);
  const many = evaluateAchievements({ puzzleSolveCount: 25, wins: 3, masteredOpenings: 2 });
  for (const k of ["puzzles_1", "puzzles_3", "puzzles_10", "puzzles_25", "first_win", "opening_master"]) {
    assert.ok(many.includes(k), k);
  }
  const few = evaluateAchievements({ puzzleSolveCount: 3, wins: 0, masteredOpenings: 0 });
  assert.deepEqual(few.sort(), ["puzzles_1", "puzzles_3"]);
});

// ---- perks ----
test("perk defs ported (neon 500 / titan 1000)", () => {
  assert.equal(PERK_DEFS.length, 2);
  assert.equal(perkDef("neon")!.cost, 500);
  assert.equal(perkDef("titan")!.cost, 1000);
  assert.equal(perkDef("nope"), undefined);
});

// ---- payload security ----
test("quest claim payload only accepts a known questKey; xp/reward injected are ignored", () => {
  const parsed = questClaimSchema.parse({ questKey: "puzzles", xp: 99999, reward: 99999, completed: true }) as Record<string, unknown>;
  assert.equal("xp" in parsed, false);
  assert.equal("reward" in parsed, false);
  assert.equal("completed" in parsed, false);
  assert.equal(parsed.questKey, "puzzles");
  assert.equal(questClaimSchema.safeParse({ questKey: "hack" }).success, false);
});
test("perk buy payload only accepts perkKey; injected cost/xp ignored", () => {
  const parsed = perkBuySchema.parse({ perkKey: "neon", cost: 0, xp: 99999 }) as Record<string, unknown>;
  assert.equal("cost" in parsed, false);
  assert.equal("xp" in parsed, false);
  assert.equal(parsed.perkKey, "neon");
});
