import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDomainSkill, MIN_EVIDENCE, type AttemptEvent } from "../src/features/training/lib/skill.ts";
import { initialReview, schedule, isDue } from "../src/features/training/lib/review.ts";
import { aggregateByTheme, detectWeaknesses } from "../src/features/training/lib/mistakes.ts";
import { selectNext, targetBandFromScore, type Candidate } from "../src/features/training/lib/select.ts";
import { chessDNA } from "../src/features/training/lib/dna.ts";
import { themeDomains } from "../src/features/training/lib/domains.ts";

const ev = (success: boolean, difficulty: AttemptEvent["difficulty"] = "hard"): AttemptEvent =>
  ({ domain: "checkmate_patterns", difficulty, success });

// ---- skill model ----
test("cold start: no events => neutral score 50, zero confidence, insufficient", () => {
  const s = computeDomainSkill("checkmate_patterns", []);
  assert.equal(s.score, 50); assert.equal(s.confidence, 0); assert.equal(s.sufficient, false);
});
test("successes raise score; failures lower it; difficulty matters", () => {
  const up = computeDomainSkill("checkmate_patterns", Array(8).fill(ev(true)));
  const down = computeDomainSkill("checkmate_patterns", Array(8).fill(ev(false)));
  assert.ok(up.score > 50 && down.score < 50);
  // a hard success outweighs an easy success
  const hard = computeDomainSkill("checkmate_patterns", [ev(true, "expert")]);
  const easy = computeDomainSkill("checkmate_patterns", [ev(true, "easy")]);
  assert.ok(hard.score >= easy.score);
});
test("confidence reaches 'sufficient' only at MIN_EVIDENCE attempts", () => {
  assert.equal(computeDomainSkill("checkmate_patterns", Array(MIN_EVIDENCE - 1).fill(ev(true))).sufficient, false);
  assert.equal(computeDomainSkill("checkmate_patterns", Array(MIN_EVIDENCE).fill(ev(true))).sufficient, true);
});
test("score is bounded [0,100] and deterministic", () => {
  const a = computeDomainSkill("checkmate_patterns", Array(30).fill(ev(true)));
  const b = computeDomainSkill("checkmate_patterns", Array(30).fill(ev(true)));
  assert.deepEqual(a, b);
  assert.ok(a.score <= 100 && a.score >= 0);
});

// ---- spaced repetition ----
test("review scheduling: fail returns soon, successes push further out, deterministic", () => {
  const now = 1_000_000_000_000;
  let st = initialReview(now);
  st = schedule(st, "success", now); assert.equal(st.intervalDays, 1);
  st = schedule(st, "success", now); assert.equal(st.intervalDays, 3);
  const after3 = schedule(st, "success", now); assert.ok(after3.intervalDays > 3);
  const failed = schedule(after3, "fail", now);
  assert.equal(failed.intervalDays, 1); assert.equal(failed.reps, 0);
  assert.equal(schedule(initialReview(now), "success", now).dueAt, now + 86400000); // deterministic
});
test("isDue is true when now >= dueAt", () => {
  assert.equal(isDue({ dueAt: 100 }, 100), true);
  assert.equal(isDue({ dueAt: 200 }, 100), false);
});

// ---- mistake memory ----
test("recurring weakness detected only with enough attempts + high fail rate", () => {
  const events = [
    ...Array(3).fill({ theme: "mateIn2", outcome: "fail" as const }),
    ...Array(2).fill({ theme: "mateIn2", outcome: "success" as const }),
    { theme: "mateIn3", outcome: "fail" as const }, // single failure -> not a weakness
  ];
  const stats = aggregateByTheme(events);
  const weak = detectWeaknesses(stats).map((w) => w.theme);
  assert.deepEqual(weak, ["mateIn2"]); // 3/5 fails, sufficient
  assert.equal(weak.includes("mateIn3"), false); // insufficient evidence
});

// ---- adaptive selection ----
const cand = (id: number, theme: string, difficulty: Candidate["difficulty"], solved = false): Candidate => ({ id, theme, difficulty, solved });
test("due review takes top priority", () => {
  const r = selectNext({ candidates: [cand(1, "mateIn2", "hard"), cand(2, "mateIn2", "hard")], dueReviewIds: [2], weaknessThemes: [], hasHistory: true, targetBand: "hard" });
  assert.equal(r.reason, "due_review"); assert.equal(r.puzzleId, 2);
});
test("weakness practice chosen over plain progression", () => {
  const r = selectNext({ candidates: [cand(1, "mateIn2", "hard"), cand(2, "mateIn3", "expert")], dueReviewIds: [], weaknessThemes: ["mateIn3"], hasHistory: true, targetBand: "hard" });
  assert.equal(r.reason, "weakness"); assert.equal(r.puzzleId, 2);
});
test("cold start picks an unsolved puzzle near easy, deterministically", () => {
  const cands = [cand(3, "mateIn3", "expert"), cand(1, "mateIn2", "easy"), cand(2, "mateIn2", "medium")];
  const r = selectNext({ candidates: cands, dueReviewIds: [], weaknessThemes: [], hasHistory: false, targetBand: "easy" });
  assert.equal(r.reason, "cold_start"); assert.equal(r.puzzleId, 1);
});
test("content scarcity is reported honestly", () => {
  assert.equal(selectNext({ candidates: [], dueReviewIds: [], weaknessThemes: [], hasHistory: false, targetBand: "easy" }).contentStatus, "unavailable");
  assert.equal(selectNext({ candidates: [cand(1, "mateIn2", "easy")], dueReviewIds: [], weaknessThemes: [], hasHistory: false, targetBand: "easy" }).contentStatus, "limited");
});
test("selection is deterministic for identical inputs", () => {
  const mk = () => ({ candidates: [cand(2, "mateIn2", "hard"), cand(1, "mateIn2", "hard")], dueReviewIds: [], weaknessThemes: [], hasHistory: true, targetBand: "hard" as const });
  assert.deepEqual(selectNext(mk()), selectNext(mk()));
});
test("targetBand follows demonstrated score, easy when insufficient", () => {
  assert.equal(targetBandFromScore(90, false), "easy");
  assert.equal(targetBandFromScore(90, true), "expert");
  assert.equal(targetBandFromScore(45, true), "medium");
});

// ---- chess DNA ----
test("DNA: insufficient domains say so; relative strength computed from measured ones", () => {
  const skills = [
    computeDomainSkill("checkmate_patterns", Array(8).fill(ev(true))),   // high, sufficient
    computeDomainSkill("calculation", Array(8).fill(ev(false))),         // low, sufficient
    computeDomainSkill("endgame", []),                                   // none
  ];
  const dna = chessDNA(skills);
  const eg = dna.find((d) => d.domain === "endgame")!;
  assert.equal(eg.band, "insufficient_evidence"); assert.equal(eg.score, null);
  const cm = dna.find((d) => d.domain === "checkmate_patterns")!;
  const cal = dna.find((d) => d.domain === "calculation")!;
  assert.ok(["strong", "steady"].includes(cm.band));
  assert.ok(["developing", "steady"].includes(cal.band));
});

// ---- theme→domain mapping ----
test("mate themes map to checkmate_patterns (+calculation for longer mates)", () => {
  assert.ok(themeDomains("mateIn1").some((d) => d.domain === "checkmate_patterns"));
  assert.ok(themeDomains("mateIn3").some((d) => d.domain === "calculation"));
});
