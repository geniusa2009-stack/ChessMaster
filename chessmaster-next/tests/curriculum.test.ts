import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS, UNAVAILABLE_SKILLS, skillForPuzzle, coverageStatus, getSkill } from "@/features/curriculum/lib/catalog.ts";
import { isAcyclic, detectCycle, topoOrder, missingPrerequisiteRefs, orphanedSkills, prerequisitesSatisfied } from "@/features/curriculum/lib/graph.ts";
import { validateCurriculum } from "@/features/curriculum/lib/validate.ts";
import { computeSkillProgress, type SkillEvidence } from "@/features/curriculum/lib/progress.ts";
import { selectCurriculumNext, buildCurriculumSession } from "@/features/curriculum/lib/select.ts";
import type { Candidate } from "@/features/training/lib/select.ts";

// ---- parse the audited corpus (no server-only import) and derive eligibility via the pure mapping ----
const SRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(SRC.slice(SRC.indexOf("[{"), SRC.indexOf("}]") + 2)) as { id: number; domain: string; theme: string; difficulty: Candidate["difficulty"] }[];
const counts: Record<string, number> = {};
const candidatesBySkill: Record<string, Candidate[]> = {};
for (const s of SKILLS) { counts[s.id] = 0; candidatesBySkill[s.id] = []; }
for (const p of PUZZLES) {
  const sk = skillForPuzzle(p)!;
  counts[sk] = (counts[sk] ?? 0) + 1;
  (candidatesBySkill[sk] ??= []).push({ id: p.id, theme: p.theme, difficulty: p.difficulty, solved: false });
}

// ================= A. CATALOG / GRAPH INTEGRITY =================
test("every skill has a stable id, name key and objective key", () => {
  for (const s of SKILLS) {
    assert.match(s.id, /^[a-z0-9_]+$/);
    assert.ok(s.nameKey && s.objectiveKey, `${s.id} missing keys`);
  }
});
test("prerequisite graph is acyclic, references exist, no orphans", () => {
  assert.deepEqual(missingPrerequisiteRefs(), []);
  assert.deepEqual(detectCycle(), []);
  assert.equal(isAcyclic(), true);
  assert.deepEqual(orphanedSkills(), []);
  // topological order lists every skill, prerequisites first
  const order = topoOrder();
  assert.equal(order.length, SKILLS.length);
  for (const s of SKILLS) for (const p of s.prerequisites) assert.ok(order.indexOf(p) < order.indexOf(s.id), `${p} must precede ${s.id}`);
});
test("curriculum integrity validator passes on the real catalog + corpus", () => {
  const v = validateCurriculum(counts);
  assert.equal(v.ok, true, JSON.stringify(v.findings));
  assert.equal(v.findings.filter((f) => f.severity === "error").length, 0);
});
test("every production puzzle maps to exactly one skill; all 271 covered; no empty skill", () => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, PUZZLES.length);
  assert.equal(total, 271);
  for (const s of SKILLS) assert.ok(counts[s.id] > 0, `${s.id} has no content`);
});
test("declared-unavailable skills carry no content and are not active skills", () => {
  const active = new Set(SKILLS.map((s) => s.id));
  for (const u of UNAVAILABLE_SKILLS) {
    assert.equal(active.has(u.id), false, `${u.id} should not be an active skill`);
    assert.equal(counts[u.id] ?? 0, 0);
  }
});

// ================= B. SEMANTIC MAPPING =================
test("mapped skill's domain always equals the puzzle's audited domain", () => {
  for (const p of PUZZLES) assert.equal(getSkill(skillForPuzzle(p)!)!.domain, p.domain, `#${p.id}`);
});
test("the reclassified defensive puzzle (id 165) maps to defensive_resources, not a tactical skill", () => {
  const p165 = PUZZLES.find((x) => x.id === 165)!;
  assert.equal(skillForPuzzle(p165), "defensive_resources");
});
test("opening-domain puzzles map to a PROVISIONAL skill (no opening-theory claim)", () => {
  const openers = PUZZLES.filter((p) => p.domain === "opening_knowledge");
  assert.ok(openers.length > 0);
  for (const p of openers) assert.equal(skillForPuzzle(p), "opening_stage_tactics");
  assert.equal(getSkill("opening_stage_tactics")!.confidence, "provisional");
  // provisional caps coverage at "limited" even with many items
  assert.equal(coverageStatus(counts["opening_stage_tactics"], "provisional"), "limited");
});
test("endgame classification is not treated as a broad endgame course; concept skills remain unavailable", () => {
  assert.ok(UNAVAILABLE_SKILLS.some((u) => u.id === "opposition_key_squares"));
  // endgame_conversion is backed by real items but honestly bounded
  assert.ok(counts["endgame_conversion"] >= 5);
});
test("coverage thresholds are honest and deterministic", () => {
  assert.equal(coverageStatus(0, "verified"), "unavailable");
  assert.equal(coverageStatus(3, "verified"), "insufficient");
  assert.equal(coverageStatus(10, "verified"), "limited");
  assert.equal(coverageStatus(20, "verified"), "available");
  assert.equal(coverageStatus(20, "provisional"), "limited");
});

// ================= C. SELECTION =================
const freshProgress = () => computeSkillProgress({}, counts);
const base = () => ({ progress: freshProgress(), candidatesBySkill: clone(candidatesBySkill), dueReviewIds: [] as number[], weaknessThemes: [] as string[], hasHistory: false, targetBand: "easy" as const });
function clone(c: Record<string, Candidate[]>): Record<string, Candidate[]> { const o: Record<string, Candidate[]> = {}; for (const k of Object.keys(c)) o[k] = c[k].map((x) => ({ ...x })); return o; }

test("cold-start learner gets an entry skill with a real puzzle and a cold_start reason", () => {
  const rec = selectCurriculumNext(base());
  assert.equal(rec.reason, "cold_start");
  assert.ok(rec.skillId && rec.puzzleId != null);
  assert.equal(getSkill(rec.skillId!)!.prerequisites.length, 0, "cold start must not pick a locked skill");
});
test("selection is deterministic for identical inputs", () => {
  assert.deepEqual(selectCurriculumNext(base()), selectCurriculumNext(base()));
});
test("locked skills (unmet prerequisites) are never selected at cold start", () => {
  const prog = freshProgress();
  assert.equal(prog.forced_mate.state, "locked");
  assert.equal(prog.calculation_combinations.state, "locked");
  const rec = selectCurriculumNext(base());
  assert.notEqual(rec.skillId, "forced_mate");
  assert.notEqual(rec.skillId, "calculation_combinations");
});
test("due review is prioritized over new progression", () => {
  const b = base();
  const target = candidatesBySkill["tactical_recognition"][0].id;
  b.dueReviewIds = [target];
  // mark it solved so it isn't an unsolved-progression candidate, only a due review
  for (const c of b.candidatesBySkill["tactical_recognition"]) if (c.id === target) c.solved = true;
  const rec = selectCurriculumNext(b);
  assert.equal(rec.reason, "review_due");
  assert.equal(rec.puzzleId, target);
});
test("weakness practice is chosen when a weakness theme has an unsolved candidate", () => {
  const b = base(); b.hasHistory = true;
  b.weaknessThemes = ["defensive"]; // defensive_resources has theme 'defensive'
  const rec = selectCurriculumNext(b);
  assert.equal(rec.reason, "weakness");
  assert.equal(rec.skillId, "defensive_resources");
});
test("empty candidate set yields a safe 'none' recommendation", () => {
  const b = base(); b.candidatesBySkill = {}; b.progress = computeSkillProgress({}, {});
  const rec = selectCurriculumNext(b);
  assert.equal(rec.reason, "none");
  assert.equal(rec.puzzleId, null);
});
test("a session contains only distinct puzzle ids", () => {
  const items = buildCurriculumSession(base(), 8);
  assert.ok(items.length > 0 && items.length <= 8);
  assert.equal(new Set(items.map((i) => i.puzzleId)).size, items.length);
});
test("selector never returns a puzzle id outside the corpus", () => {
  const ids = new Set(PUZZLES.map((p) => p.id));
  for (let i = 0; i < 20; i++) { const rec = selectCurriculumNext(base()); if (rec.puzzleId != null) assert.ok(ids.has(rec.puzzleId)); }
});

// ================= D. MASTERY =================
test("one correct attempt does NOT grant proficiency", () => {
  const ev: Record<string, SkillEvidence> = { mate_in_one: { attempts: 1, correct: 1, distinctSolved: 1, dueCount: 0 } };
  const prog = computeSkillProgress(ev, counts);
  assert.equal(prog.mate_in_one.state, "needs_more_evidence");
});
test("a skip (no attempt) never advances state beyond available", () => {
  const prog = computeSkillProgress({}, counts);
  assert.equal(prog.mate_in_one.state, "available");
});
test("proficiency requires enough distinct solves, attempts and success rate", () => {
  const ev: Record<string, SkillEvidence> = { mate_in_one: { attempts: 8, correct: 7, distinctSolved: 5, dueCount: 0 } };
  const prog = computeSkillProgress(ev, counts);
  assert.equal(prog.mate_in_one.state, "proficient");
  // low success rate -> practicing, not proficient
  const ev2: Record<string, SkillEvidence> = { mate_in_one: { attempts: 8, correct: 3, distinctSolved: 5, dueCount: 0 } };
  assert.equal(computeSkillProgress(ev2, counts).mate_in_one.state, "practicing");
});
test("proficiency in a prerequisite unlocks the dependent skill", () => {
  const ev: Record<string, SkillEvidence> = { mate_in_one: { attempts: 8, correct: 7, distinctSolved: 5, dueCount: 0 } };
  const prog = computeSkillProgress(ev, counts);
  assert.equal(prerequisitesSatisfied("forced_mate", new Set(["mate_in_one"])), true);
  assert.notEqual(prog.forced_mate.state, "locked");
});
