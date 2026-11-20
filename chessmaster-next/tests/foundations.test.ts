import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { FOUNDATION_LESSONS, FOUNDATION_DEMOS, FOUNDATION_ASSESSMENT, FOUNDATION_PASS, FOUNDATION_ASSESSMENT_LEVEL,
  COMPETENCIES, COMPETENCY_IDS, lessonForCompetency, type AssessPrompt } from "@/features/campaign/lib/foundations.ts";
import { gradeFoundation, correctIndex, acceptedMoves, type Submission } from "@/features/campaign/lib/foundations.answers.server.ts";
import { LEVELS } from "@/features/campaign/lib/catalog.ts";
import { VIDEO_LESSONS } from "@/features/campaign/lib/videos.ts";
import { resolveCampaignPure, countSolvedByLevel, type Candidate } from "@/features/campaign/lib/resolve.ts";
import { computeCampaignState } from "@/features/campaign/lib/progress.ts";
import { CH02_DEMOS } from "@/features/campaign/lib/demos.ts";
import { skillForPuzzle } from "@/features/curriculum/lib/catalog.ts";

// ---- resolver inputs ----
const PSRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "puzzles", "lib", "data.server.ts"), "utf8");
const PUZZLES = JSON.parse(PSRC.slice(PSRC.indexOf("[{"), PSRC.indexOf("}]") + 2)) as { id: number; domain: string; theme: string; difficulty: string }[];
const elig: Record<string, Candidate[]> = {};
for (const p of PUZZLES) { const s = skillForPuzzle(p); if (s) (elig[s] ??= []).push({ id: p.id, difficulty: p.difficulty }); }
const OSRC = readFileSync(join(import.meta.dirname, "..", "src", "features", "openings", "lib", "data.ts"), "utf8");
const OPENINGS = (JSON.parse(OSRC.slice(OSRC.indexOf("[{"), OSRC.lastIndexOf("}]") + 2)) as { id: string; tier: string }[]).map((o) => ({ id: o.id, tier: o.tier }));
const resolved = resolveCampaignPure(elig, OPENINGS);
const rs = Object.fromEntries(Object.entries(resolved).map(([k, v]) => [k, { playable: v.playable, minExercises: v.minExercises }]));

// ============ A. CH01 CURRICULUM ============
test("CH01 has 12 real lessons covering all fundamentals, with a chained prereq order", () => {
  const ch01 = LEVELS.filter((l) => l.chapterId === "CH01");
  assert.equal(ch01.length, 12);
  for (let i = 1; i < ch01.length; i++) assert.deepEqual(ch01[i].prerequisites, [ch01[i - 1].id], `${ch01[i].id} prereq chain`);
  const text = FOUNDATION_LESSONS.map((l) => l.title + l.concepts.join()).join(" ").toLowerCase();
  for (const need of ["board", "king", "queen", "rook", "bishop", "knight", "pawn", "block", "check", "checkmate", "stalemate", "castl", "passant", "promotion"])
    assert.ok(text.includes(need), `missing fundamental: ${need}`);
});

// ============ B. BOARD DEMONSTRATIONS ============
test("every CH01 board demonstration is chess-valid (legal replay / confirmed illegal)", () => {
  for (const d of FOUNDATION_DEMOS) {
    const g = new Chess(d.fen);
    if (d.legal) {
      for (const s of d.sequence) { const m = g.move({ from: s.uci.slice(0, 2), to: s.uci.slice(2, 4), promotion: s.uci[4] || undefined }); assert.ok(m && m.san === s.san, `${d.id} ${s.uci}`); }
      if (d.shows === "checkmate") assert.ok(g.isCheckmate(), `${d.id} not mate`);
      if (d.shows === "stalemate") assert.ok(g.isStalemate(), `${d.id} not stalemate`);
      if (d.shows === "check") assert.ok(g.inCheck(), `${d.id} not check`);
    } else {
      let rejected = false;
      try { rejected = !g.move({ from: d.rejectedUci!.slice(0, 2), to: d.rejectedUci!.slice(2, 4), promotion: d.rejectedUci![4] }); } catch { rejected = true; }
      assert.ok(rejected, `${d.id} illegal move was accepted`);
    }
    assert.ok(LEVELS.some((l) => l.id === d.lessonId), `${d.id} bad lesson ref`);
  }
});

// ============ C. ASSESSMENT GRADING (server-authoritative, competency-gated) ============
// A correct submission: choice items use the server-computed correctIndex; objective drills use a
// server-accepted move. (correctIndex/acceptedMoves live only in the server-only grader.)
const correctSub = (p: AssessPrompt): Submission =>
  p.type === "move_objective" ? { id: p.id, uci: acceptedMoves(p)[0] } : { id: p.id, answerIndex: correctIndex(p) };
const fullCorrect = () => FOUNDATION_ASSESSMENT.map(correctSub);

test("a fully correct submission passes with every mandatory competency demonstrated", () => {
  const g = gradeFoundation(fullCorrect());
  assert.equal(g.score, FOUNDATION_ASSESSMENT.length);
  assert.equal(g.passed, true);
  assert.ok(g.perCompetency.filter((c) => c.mandatory).every((c) => c.status === "demonstrated"));
  assert.equal(g.remediation.length, 0);
});
test("an all-'yes' submission (no drills) fails", () => {
  const allYes = gradeFoundation(FOUNDATION_ASSESSMENT.map((p) => ({ id: p.id, answerIndex: 0 })));
  assert.equal(allYes.passed, false);
});
test("grader is deterministic", () => {
  const subs = fullCorrect();
  assert.deepEqual(gradeFoundation(subs), gradeFoundation(subs));
});

// ---- THE CORE R7.3 GUARANTEE: a high aggregate score cannot mask a failed mandatory competency ----
test("high aggregate score but ONE failed mandatory competency => chapter FAILS", () => {
  // Fail the stalemate competency (flip ALL its contexts) and nothing else; every other competency
  // keeps enough correct distinct contexts to stay demonstrated, so the aggregate score stays high.
  const staleIds = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === "foundation.stalemate").map((p) => p.id));
  const subs = fullCorrect().map((s) => staleIds.has(s.id)
    ? { id: s.id, answerIndex: (correctIndex(FOUNDATION_ASSESSMENT.find((p) => p.id === s.id)!) === 0 ? 1 : 0) } : s);
  const g = gradeFoundation(subs);
  assert.ok(g.score >= FOUNDATION_PASS, "aggregate score still clears the display floor");
  assert.equal(g.overallFloorMet, true);
  assert.equal(g.passed, false, "but the chapter must not pass with a mandatory competency unmet");
  const stale = g.perCompetency.find((c) => c.competency === "foundation.stalemate")!;
  assert.equal(stale.status, "needs_remediation");
});

// ============ D. CH01 -> CH02 GATING ============
test("cold start: CH01 entry available, CH02 locked; foundation pass unlocks CH02", () => {
  const ch2 = LEVELS.find((l) => l.chapterId === "CH02")!;
  assert.ok(ch2.prerequisites.includes(FOUNDATION_ASSESSMENT_LEVEL), "CH02 must require the CH01 assessment");
  const cold = computeCampaignState({ solvedByLevel: countSolvedByLevel(resolved, new Set(), new Set(), false), resolved: rs });
  assert.equal(cold["CH01-L001"].state, "available");
  assert.equal(cold[ch2.id].state, "locked");
  const after = computeCampaignState({ solvedByLevel: countSolvedByLevel(resolved, new Set(), new Set(), true), resolved: rs });
  assert.equal(after[FOUNDATION_ASSESSMENT_LEVEL].state, "passed");
  assert.notEqual(after[ch2.id].state, "locked");
});
test("foundation NOT passed keeps the assessment unpassed and CH02 locked", () => {
  const st = computeCampaignState({ solvedByLevel: countSolvedByLevel(resolved, new Set(), new Set(), false), resolved: rs });
  assert.notEqual(st[FOUNDATION_ASSESSMENT_LEVEL].state, "passed");
});

// ============ E. CH02 PRESERVATION ============
test("CH02 still has its 7 levels, 5 demos and 3 scripts", () => {
  assert.equal(LEVELS.filter((l) => l.chapterId === "CH02").length, 7);
  assert.equal(CH02_DEMOS.length, 5);
  for (const v of ["V-CH02-CONCEPT", "V-CH02-DEMO", "V-CH02-REVIEW"]) {
    assert.ok(VIDEO_LESSONS.some((x) => x.id === v), `missing ${v}`);
    assert.ok(existsSync(join(import.meta.dirname, "..", "docs", "video-scripts", `${v}.md`)), `missing script ${v}`);
  }
});

// ============ F. VIDEO STATUS HONESTY ============
test("CH01 videos are script_ready with scripts on disk; none recorded; no assets", () => {
  for (const les of FOUNDATION_LESSONS) {
    const v = VIDEO_LESSONS.find((x) => x.id === `V-${les.id}`)!;
    assert.ok(v, `missing video for ${les.id}`);
    assert.equal(v.state, "script_ready");
    assert.equal(v.asset, null);
    assert.ok(existsSync(join(import.meta.dirname, "..", "docs", "video-scripts", `V-${les.id}.md`)), `missing script V-${les.id}`);
  }
});

// ============ G. SECURITY ============
test("assessment route grades server-side and never returns the answer key", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "attempt", "route.ts"), "utf8");
  assert.ok(route.includes("getAuthedProfile"));
  assert.ok(route.includes("gradeFoundation"));
  assert.equal(/correctIndex|answerKey|correct:/.test(route.split("return NextResponse.json")[1] ?? ""), false, "route must not return correct answers");
});
test("the answer grader is a server-only module; client prompts carry no answers", () => {
  const ans = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.answers.server.ts"), "utf8");
  assert.ok(ans.startsWith('import "server-only"'));
  const pub = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.ts"), "utf8");
  assert.equal(pub.includes('"server-only"'), false, "public foundations module must be client-safe");
  assert.equal(/answer\s*:/.test(JSON.stringify(FOUNDATION_ASSESSMENT)), false, "prompts must not embed answers");
});
test("client components do not import the server-only grader", () => {
  for (const p of ["app/foundations/FoundationsClient.tsx", "features/campaign/components/BoardDemoPlayer.tsx"]) {
    const s = readFileSync(join(import.meta.dirname, "..", "src", p), "utf8");
    assert.equal(s.includes("answers.server"), false, `${p} must not import the grader`);
  }
});

// ============ H. COMPETENCY MATRIX COMPLETENESS (R7.3) ============
test("every competency has a real remediation lesson and >=1 graded assessment item", () => {
  for (const c of COMPETENCIES) {
    assert.ok(LEVELS.some((l) => l.id === c.lessonId), `${c.id} -> unknown lesson ${c.lessonId}`);
    assert.equal(lessonForCompetency(c.id), c.lessonId);
    const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id);
    assert.ok(items.length >= 1, `competency ${c.id} has no graded item`);
  }
});
test("every assessment item references a known competency; the 16 CH01 competencies are all present", () => {
  for (const p of FOUNDATION_ASSESSMENT) assert.ok(COMPETENCY_IDS.has(p.competency), `${p.id} bad competency ${p.competency}`);
  assert.equal(COMPETENCIES.length, 16);
  const covered = new Set(FOUNDATION_ASSESSMENT.map((p) => p.competency));
  for (const c of COMPETENCIES) assert.ok(covered.has(c.id), `${c.id} not covered by any item`);
});
test("not_attempted vs demonstrated: an empty submission demonstrates nothing", () => {
  const g = gradeFoundation([]);
  assert.equal(g.passed, false);
  assert.ok(g.perCompetency.every((c) => c.status === "not_attempted"));
});

// ============ I. OBJECTIVE-SPECIFIC DRILLS (R7.3) ============
test("each drill accepts only objective-satisfying moves; a legal-but-irrelevant move is rejected", () => {
  const drills = FOUNDATION_ASSESSMENT.filter((p) => p.type === "move_objective");
  assert.ok(drills.length >= 2, "expected CH01 objective drills (pawn capture + check response)");
  for (const p of drills) {
    const accepts = acceptedMoves(p);
    assert.ok(accepts.length >= 1, `${p.id} has no accepted move`);
    // every accepted move is legal AND satisfies the objective
    for (const uci of accepts) {
      const g = new Chess(p.fen!);
      const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
      assert.ok(mv, `${p.id} accepted an illegal move ${uci}`);
      assert.equal(mv!.to, p.target, `${p.id} ${uci} not on target ${p.target}`);
      if (p.objectiveKind === "capture_on") assert.ok(mv!.captured, `${p.id} ${uci} is not a capture`);
    }
    // a legal move that does NOT satisfy the objective must grade as incorrect
    const g2 = new Chess(p.fen!);
    const legal = (g2.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>)
      .map((m) => m.from + m.to + (m.promotion ?? ""));
    const irrelevant = legal.find((u) => !accepts.includes(u));
    assert.ok(irrelevant, `${p.id} every legal move satisfies the objective (bad drill)`);
    const bad = gradeFoundation([{ id: p.id, uci: irrelevant! }]);
    assert.equal(bad.perItem.find((x) => x.id === p.id)!.correct, false, `${p.id} accepted irrelevant ${irrelevant}`);
    // an illegal move string is rejected
    const ill = gradeFoundation([{ id: p.id, uci: "a1a2" }]);
    assert.equal(ill.perItem.find((x) => x.id === p.id)!.correct, false, `${p.id} accepted an illegal move`);
  }
});
test("a drill with multiple valid answers accepts ANY qualifying move", () => {
  // Two white pawns (c4, e4) can both capture a black pawn on d5. Both captures satisfy capture_on d5.
  const p: AssessPrompt = { id: "SYN-MULTI", competency: "foundation.pawn_capture", objective: "two captMoves", contextKey: "syn-multi",
    type: "move_objective", fen: "4k3/8/8/3p4/2P1P3/8/8/4K3 w - - 0 1", objectiveKind: "capture_on", target: "d5", promptAr: "", options: [] };
  const accepts = acceptedMoves(p).sort();
  assert.deepEqual(accepts, ["c4d5", "e4d5"], "both diagonal captures onto d5 must be accepted");
  // Each qualifying capture is legal and lands on the target.
  for (const uci of accepts) {
    const g = new Chess(p.fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    assert.ok(mv && mv.to === "d5" && mv.captured, `${uci} should be a capture on d5`);
  }
});

// ============ J. TARGETED REMEDIATION (R7.3 / R7.3.1) ============
const flip = (s: Submission) => ({ id: s.id, answerIndex: (correctIndex(FOUNDATION_ASSESSMENT.find((p) => p.id === s.id)!) === 0 ? 1 : 0) });
test("a failed mandatory competency routes to ITS specific lesson, not a generic CH01-L001", () => {
  // Castling has 3 contexts (minContexts 2) — drop it below policy by failing TWO of them.
  const fail = new Set(["FA-CASTLE-NO", "FA-CASTLE-BLOCKED"]);
  const subs = fullCorrect().map((s) => fail.has(s.id) ? flip(s) : s);
  const g = gradeFoundation(subs);
  assert.equal(g.passed, false);
  const rem = g.remediation.find((r) => r.competency === "foundation.castling");
  assert.ok(rem, "castling must appear in remediation");
  assert.equal(rem!.lessonId, "CH01-L009", "remediation must point to the castling lesson");
  assert.notEqual(rem!.lessonId, "CH01-L001");
  // other competencies stay demonstrated — remediation is targeted, not a full-chapter reset
  assert.equal(g.remediation.length, 1, "only the failed competency is in remediation");
});

// ============ K. PERSISTENCE / PASS-LATCH (route is server-authoritative; prior pass never downgraded) ============
test("the shared persistence boundary latches a pass and never downgrades; evidence carries no answers", () => {
  // R7.3.2.2: the idempotency + pass-latch DECISIONS live in the shared production module, which both
  // the route and the real-PostgreSQL harness call.
  const persist = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.persistence.server.ts"), "utf8");
  assert.ok(/grade\.passed\s*\|\|\s*existing\?\.passed/.test(persist), "a prior pass keeps the latch set (never downgrade)");
  assert.ok(/insertAttemptIfAbsent/.test(persist), "append-only idempotent insert");
  assert.equal(/answerIndex|\buci\b|correctIndex/.test(persist), false, "persistence stores no answers");
  // R7.3.2.2.1: the score MAX is now computed atomically at the DB (not Math.max in app memory).
  assert.equal(/Math\.max\(grade\.score/.test(persist), false, "no app-memory max (race-prone) in the shared boundary");
  const adapter = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.persistence.supabase.server.ts"), "utf8");
  assert.ok(/onConflict:\s*"user_id,attempt_id".*ignoreDuplicates:\s*true/s.test(adapter), "DB idempotency on (user_id, attempt_id)");
  assert.ok(/rpc\("foundation_latch_pass"/.test(adapter), "pass latch uses the atomic DB function (GREATEST), not a read-then-write upsert");
  const sql = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "0017_foundation_latch_pass.sql"), "utf8");
  assert.ok(/greatest\(public\.foundation_assessment\.score,\s*excluded\.score\)/i.test(sql), "0017 enforces score = GREATEST atomically");
  assert.ok(/passed\s*=\s*public\.foundation_assessment\.passed\s+or\s+excluded\.passed/i.test(sql), "0017 enforces passed = existing OR incoming");
  assert.equal(/security\s+definer/i.test(sql), false, "function is SECURITY INVOKER (RLS-enforced); no client write capability granted");
  const route = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "attempt", "route.ts"), "utf8");
  assert.ok(/persistAttempt\(/.test(route), "the route delegates to the shared persistence boundary");
});
test("migration 0014 is append-only server-written evidence with read-own RLS and no client write policy", () => {
  const sql = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "0014_foundation_attempt.sql"), "utf8");
  assert.ok(/create table .*foundation_attempt/s.test(sql));
  assert.ok(/enable row level security/.test(sql));
  assert.ok(/for select/.test(sql), "read-own select policy present");
  assert.equal(/for (insert|update|delete)/.test(sql), false, "no client write policy (server-only writes)");
});
test("migration 0015 adds per-item evidence (jsonb) and no new client write policy / no answers", () => {
  const sql = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "0015_foundation_attempt_items.sql"), "utf8");
  assert.ok(/alter table .*foundation_attempt/s.test(sql), "extends the existing table (smallest change, no new table)");
  assert.ok(/add column if not exists items jsonb/.test(sql), "adds items jsonb");
  assert.equal(/create policy|for (insert|update|delete)/.test(sql), false, "no new write policy");
  // the stored payload shape is [{id,competency,contextKey,correct}] — never answer indices / moves
  assert.equal(/answerIndex|answer_index|\buci\b/.test(sql), false, "no answer fields stored");
});

// ============ K2. SECURITY: server-derived identity + forged status ignored ============
test("attempt identity is server-derived; body carries no user/attempt id to tamper with", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "attempt", "route.ts"), "utf8");
  assert.ok(/getAuthedProfile\(\)/.test(route), "user comes from the authenticated session");
  assert.ok(/userId:\s*profile\.id/.test(route), "evidence is persisted under the session user id");
  const schemaSrc = readFileSync(join(import.meta.dirname, "..", "src", "lib", "validation", "schemas.ts"), "utf8");
  const fa = schemaSrc.slice(schemaSrc.indexOf("foundationAttemptSchema"), schemaSrc.indexOf("questClaimSchema"));
  assert.equal(/user_?id|attempt_?id/i.test(fa), false, "schema accepts no user/attempt id from the client");
});
test("client-forged correctness/pass/competency is ignored — grading derives from positions", () => {
  // A submission that LIES (wrong answers) but would carry forged pass flags still fails: gradeFoundation
  // only reads id+answerIndex/uci and recomputes correctness server-side.
  const forged = FOUNDATION_ASSESSMENT.map((p) => ({ id: p.id, answerIndex: 3 /* always-wrong */ }));
  const g = gradeFoundation(forged as Submission[]);
  assert.equal(g.passed, false);
  assert.ok(g.perCompetency.every((c) => c.status !== "demonstrated"));
});

// ============ L. EVIDENCE POLICY (R7.3.1 — demonstrate the rule, not one memorised example) ============
const sub = (id: string): Submission => {
  const p = FOUNDATION_ASSESSMENT.find((x) => x.id === id)!;
  return p.type === "move_objective" ? { id, uci: acceptedMoves(p)[0] } : { id, answerIndex: correctIndex(p) };
};
const statusOf = (g: ReturnType<typeof gradeFoundation>, comp: string) => g.perCompetency.find((c) => c.competency === comp)!;

test("one correct answer is INSUFFICIENT when the policy requires >=2 distinct contexts", () => {
  const g = gradeFoundation([sub("FA-COORD")]); // only the light-square context answered
  const c = statusOf(g, "foundation.board_coordinates");
  assert.equal(c.minContexts, 2);
  assert.equal(c.contextsDemonstrated, 1);
  assert.equal(c.status, "insufficient_evidence");
  assert.equal(g.passed, false);
});
test("two INDEPENDENT correct contexts demonstrate the competency", () => {
  const g = gradeFoundation([sub("FA-COORD"), sub("FA-COORD2")]); // light + dark
  const c = statusOf(g, "foundation.board_coordinates");
  assert.equal(c.contextsDemonstrated, 2);
  assert.equal(c.status, "demonstrated");
});
test("repeating the SAME item (same contextKey) does NOT manufacture independent evidence", () => {
  const one = sub("FA-COORD");
  const g = gradeFoundation([one, { ...one }, { ...one }]); // same item submitted three times
  const c = statusOf(g, "foundation.board_coordinates");
  assert.equal(c.contextsDemonstrated, 1, "duplicate submissions collapse to one context");
  assert.notEqual(c.status, "demonstrated");
});
test("every mandatory competency actually offers >= its minContexts distinct contexts in the bank", () => {
  for (const comp of COMPETENCIES.filter((c) => c.mandatory)) {
    const keys = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === comp.id).map((p) => p.contextKey));
    assert.ok(keys.size >= comp.minContexts, `${comp.id} offers ${keys.size} distinct contexts < minContexts ${comp.minContexts}`);
  }
});

// ============ M. VARIANT INDEPENDENCE (two "independent" variants must not be identical by construction) ============
test("no two items in a competency share a contextKey, and context variants are not identical positions", () => {
  const byComp = new Map<string, AssessPrompt[]>();
  for (const p of FOUNDATION_ASSESSMENT) (byComp.get(p.competency) ?? byComp.set(p.competency, []).get(p.competency)!).push(p);
  for (const [comp, items] of byComp) {
    const keys = items.map((p) => p.contextKey);
    assert.equal(new Set(keys).size, keys.length, `${comp} has duplicate contextKeys`);
    // distinct contexts must differ by construction (type/fen/square/move/target), not just by label
    const sig = items.map((p) => `${p.type}|${p.fen ?? ""}|${p.square ?? ""}|${p.moveUci ?? ""}|${p.target ?? ""}`);
    assert.equal(new Set(sig).size, sig.length, `${comp} has two variants identical by construction`);
  }
});
test("all variants have legal, chess-valid positions (choice answers computable; drills have accepted moves)", () => {
  for (const p of FOUNDATION_ASSESSMENT) {
    if (p.type === "move_objective") { assert.ok(acceptedMoves(p).length >= 1, `${p.id} no accepted move`); }
    else { const ci = correctIndex(p); assert.ok(ci >= 0 && ci < p.options.length, `${p.id} answer out of range`); }
  }
});
