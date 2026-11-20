import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WORLDS, CHAPTERS, LEVELS, type Level } from "@/features/campaign/lib/catalog.ts";
import { VIDEO_LESSONS, BOSSES } from "@/features/campaign/lib/videos.ts";
import { resolveCampaignPure, type Candidate } from "@/features/campaign/lib/resolve.ts";
import { validateCampaign } from "@/features/campaign/lib/validate.ts";
import { isAcyclic, missingPrereqs } from "@/features/campaign/lib/graph.ts";
import { computeCampaignState } from "@/features/campaign/lib/progress.ts";
import { skillForPuzzle } from "@/features/curriculum/lib/catalog.ts";

// build the resolver inputs by parsing the verified corpus + openings (no server-only import)
const PSRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(PSRC.slice(PSRC.indexOf("[{"), PSRC.indexOf("}]") + 2)) as { id: number; domain: string; theme: string; difficulty: string }[];
const elig: Record<string, Candidate[]> = {};
for (const p of PUZZLES) { const s = skillForPuzzle(p); if (s) (elig[s] ??= []).push({ id: p.id, difficulty: p.difficulty }); }
const OSRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "openings", "lib", "data.ts"), "utf8");
const OPENINGS = (JSON.parse(OSRC.slice(OSRC.indexOf("[{"), OSRC.lastIndexOf("}]") + 2)) as { id: string; tier: string }[]).map((o) => ({ id: o.id, tier: o.tier }));
const resolved = resolveCampaignPure(elig, OPENINGS);

// ============ A. STRUCTURE ============
test("campaign has >=100 distinct levels with stable unique IDs and valid refs", () => {
  assert.ok(LEVELS.length >= 100, `expected >=100 levels, got ${LEVELS.length}`);
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length, "duplicate level ids");
  const wIds = new Set(WORLDS.map((w) => w.id)), cIds = new Set(CHAPTERS.map((c) => c.id));
  for (const l of LEVELS) { assert.match(l.id, /^CH\d\d-L\d\d\d$/); assert.ok(wIds.has(l.worldId)); assert.ok(cIds.has(l.chapterId)); }
});
test("prerequisite graph is acyclic with no dangling references", () => {
  assert.deepEqual(missingPrereqs(), []);
  assert.equal(isAcyclic(), true);
});
test("campaign integrity validator passes against the resolved corpus", () => {
  const v = validateCampaign(resolved);
  assert.equal(v.ok, true, JSON.stringify(v.findings.filter((f) => f.severity === "error")));
});

// ============ B. LEVEL REPORTS ============
test("every level has a measurable objective, a video brief and honest status", () => {
  const STATUSES = ["ready", "limited", "planned", "future_content_required", "blocked"];
  for (const l of LEVELS) {
    assert.ok(l.learningObjective.length >= 10, `${l.id} weak objective`);
    assert.ok(l.measurableOutcome.length > 0, `${l.id} no measurable outcome`);
    assert.ok(l.videoIds.length >= 1, `${l.id} no video brief`);
    assert.ok(STATUSES.includes(resolved[l.id].status) || STATUSES.includes(l.status));
  }
});
test("every playable graded level has real content and requires >=1 exercise", () => {
  for (const l of LEVELS) {
    const r = resolved[l.id];
    const graded = ["guided_practice", "independent_practice", "assessment", "boss_challenge"].includes(l.type);
    if (graded && r.playable) { assert.ok(r.itemCount >= r.minExercises && r.minExercises >= 1, `${l.id} playable but lacks content`); }
  }
});

// ============ C. VIDEO SYSTEM ============
test("video lessons: unique ids, resolvable level refs, NO assets (all planned), no fake urls", () => {
  const vids = new Set<string>(); const levelIds = new Set(LEVELS.map((l) => l.id));
  for (const v of VIDEO_LESSONS) {
    assert.equal(vids.has(v.id), false, `dup video ${v.id}`); vids.add(v.id);
    assert.ok(v.levelIds.length >= 1, `orphan video ${v.id}`);
    for (const lv of v.levelIds) assert.ok(levelIds.has(lv), `${v.id} bad level ref ${lv}`);
    assert.equal(v.asset, null, `${v.id} must have no asset`);
    // R7.1/R7.2: CH01 + CH02 videos advance to script_ready; all others remain planned. None recorded.
    assert.ok(["planned", "script_ready"].includes(v.state), `${v.id} unexpected state ${v.state}`);
    if (!v.chapterIds.includes("CH02") && !v.chapterIds.includes("CH01")) assert.equal(v.state, "planned", `${v.id} should still be planned`);
    assert.equal(JSON.stringify(v).includes("http"), false, `${v.id} contains a URL`);
  }
  for (const l of LEVELS) for (const vId of l.videoIds) assert.ok(vids.has(vId), `${l.id} references missing video ${vId}`);
});

// ============ D. PROGRESSION ============
const stateWith = (solvedByLevel: Record<string, number>) =>
  computeCampaignState({ solvedByLevel, resolved: Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, { playable: v.playable, minExercises: v.minExercises }])) });
test("cold start: a content-backed entry concept is available; a graded-gated level is locked", () => {
  const st = stateWith({});
  // first concept of a content-backed chapter (not a planned chapter)
  const firstConcept = LEVELS.find((l) => l.type === "concept" && l.prerequisites.length === 0 && l.status !== "future_content_required")!;
  assert.equal(st[firstConcept.id].state, "available");
  // a level whose prerequisite is a GRADED (practice) level must be locked until that is passed
  const deep = LEVELS.find((l) => resolved[l.id].playable && l.prerequisites.some((p) => {
    const pr = LEVELS.find((x) => x.id === p)!; return ["guided_practice", "independent_practice"].includes(pr.type) && resolved[p].playable;
  }))!;
  assert.equal(st[deep.id].state, "locked");
});
test("passing prerequisites unlocks the next level; one solve does not pass a multi-exercise level", () => {
  // a playable second-set practice level whose prereq is another graded practice level
  const prac = LEVELS.find((l) => l.type === "independent_practice" && resolved[l.id].playable
    && l.prerequisites.some((p) => { const pr = LEVELS.find((x) => x.id === p)!; return ["guided_practice", "independent_practice"].includes(pr.type) && resolved[p].playable; }))!;
  // one solve < required => in_progress, not passed
  const partial = stateWith({ [prac.id]: 1 });
  assert.notEqual(partial[prac.id].state, "passed");
  // satisfy all prereqs by marking them solved to their requirement
  const solved: Record<string, number> = {};
  const mark = (id: string) => { const r = resolved[id]; if (r.playable) solved[id] = r.minExercises; for (const p of LEVELS.find((x) => x.id === id)!.prerequisites) mark(p); };
  mark(prac.id);
  const full = stateWith(solved);
  assert.equal(full[prac.id].state, "passed");
});
test("planned (no verified content) levels never become playable", () => {
  const st = stateWith({});
  const planned = LEVELS.filter((l) => !resolved[l.id].playable && ["guided_practice", "independent_practice", "assessment", "boss_challenge"].includes(l.type));
  for (const l of planned) assert.equal(st[l.id].state, "planned");
});

// ============ E. CONTENT INTEGRITY ============
test("no planned chapter is presented with playable practice (unsupported concepts not taught)", () => {
  // CH01 (piece movement) and CH09 (endgame theory) have no verified content
  for (const chId of ["CH01", "CH09"]) {
    const practice = LEVELS.filter((l) => l.chapterId === chId && ["guided_practice", "independent_practice"].includes(l.type));
    for (const l of practice) assert.equal(resolved[l.id].playable, false, `${l.id} should not be playable`);
  }
});
test("playable puzzle levels reference real puzzle ids from the corpus", () => {
  const ids = new Set(PUZZLES.map((p) => p.id));
  for (const l of LEVELS) {
    const r = resolved[l.id];
    if (r.playable && r.practiceKind === "puzzles") for (const id of r.itemIds) assert.ok(typeof id === "number" && ids.has(id), `${l.id} bad puzzle ref ${id}`);
  }
});
test(">=100 level blueprint with a meaningful playable subset and honest planned remainder", () => {
  const playable = LEVELS.filter((l) => resolved[l.id].playable).length;
  assert.ok(playable >= 40, `expected a substantial playable subset, got ${playable}`);
  assert.ok(playable < LEVELS.length, "some levels must remain planned (honest)");
});

// ============ BOSSES ============
test("boss challenges assess multiple steps and reference real chapters + prereq levels", () => {
  assert.ok(BOSSES.length >= 5);
  const levelIds = new Set(LEVELS.map((l) => l.id)); const chIds = new Set(CHAPTERS.map((c) => c.id));
  for (const b of BOSSES) {
    assert.ok(chIds.has(b.chapterId));
    assert.ok(b.structure.length >= 4, `${b.id} boss should be multi-step`);
    assert.ok(b.assessedSkills.length >= 1);
    for (const p of b.prerequisiteLevels) assert.ok(levelIds.has(p));
  }
});
