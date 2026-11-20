import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FOUNDATION_ASSESSMENT, COMPETENCIES, type AssessPrompt } from "@/features/campaign/lib/foundations.ts";
import { selectAttemptItems } from "@/features/campaign/lib/foundations.select.ts";
import { gradeFoundation, correctIndex, acceptedMoves, type Submission } from "@/features/campaign/lib/foundations.answers.server.ts";
import { signAttempt, verifyAttempt, authorizeSubmission, type AttemptPayload } from "@/features/campaign/lib/foundations.token.server.ts";

// deterministic RNG for reproducible selection tests (mulberry32)
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mandatory = COMPETENCIES.filter((c) => c.mandatory);
const bankIds = new Set(FOUNDATION_ASSESSMENT.map((p) => p.id));
const ctxOf = (id: string) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.contextKey;

// ============ A. ROTATION POOL (content) ============
test("every mandatory competency has >= 3 genuinely distinct contexts (rotation pool)", () => {
  for (const c of mandatory) {
    const keys = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => p.contextKey));
    assert.ok(keys.size >= 3, `${c.id} has only ${keys.size} distinct contexts (need >= 3 for rotation)`);
  }
});

// ============ B. SELECTION CONSTRAINTS ============
test("selection issues exactly 2 DISTINCT contexts for every mandatory competency, only from the bank", () => {
  const sel = selectAttemptItems({ perCompetency: 2, rng: mulberry32(1) });
  assert.equal(sel.shortfalls.length, 0);
  for (const c of mandatory) {
    const ids = sel.byCompetency[c.id];
    assert.equal(ids.length, 2, `${c.id} should get 2 items`);
    assert.equal(new Set(ids.map(ctxOf)).size, 2, `${c.id} items must be DISTINCT contexts`);
    for (const id of ids) {
      assert.ok(bankIds.has(id), `${id} not from the bank`);
      assert.equal(FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.competency, c.id, `${id} wrong competency`);
    }
  }
  assert.equal(sel.itemIds.length, mandatory.length * 2);
});
test("selection is deterministic for a given RNG, and not derived from client input", () => {
  assert.deepEqual(selectAttemptItems({ perCompetency: 2, rng: mulberry32(42) }),
                   selectAttemptItems({ perCompetency: 2, rng: mulberry32(42) }));
});
test("consecutive attempts rotate: excluding the previous set changes the selection", () => {
  const first = selectAttemptItems({ perCompetency: 2, rng: mulberry32(7) });
  const second = selectAttemptItems({ perCompetency: 2, exclude: first.itemIds, rng: mulberry32(7) });
  // still valid coverage
  assert.equal(second.shortfalls.length, 0);
  for (const c of mandatory) assert.equal(new Set(second.byCompetency[c.id].map(ctxOf)).size, 2);
  // and the full selection is not identical to the previous one (pool of 3 > 2 issued => fresh context rotates in)
  assert.notDeepEqual([...first.itemIds].sort(), [...second.itemIds].sort());
  // every competency rotated in at least one context it did not just see
  for (const c of mandatory) {
    const prev = new Set(first.byCompetency[c.id]);
    assert.ok(second.byCompetency[c.id].some((id) => !prev.has(id)), `${c.id} did not rotate`);
  }
});
test("selection reports a shortfall instead of silently under-covering when the pool is too small", () => {
  // a crippled bank with only ONE context for a competency cannot satisfy perCompetency=2
  const crippled = FOUNDATION_ASSESSMENT.filter((p) => p.competency !== "foundation.check" || p.id === "FA-CHECK");
  const sel = selectAttemptItems({ perCompetency: 2, rng: mulberry32(1), bank: crippled });
  assert.ok(sel.shortfalls.some((s) => s.startsWith("foundation.check")), "must report the under-covered competency");
});

// ============ C. ATTEMPT TOKEN ============
const KEY = Buffer.from("test-signing-key-32-bytes-long!!", "utf8");
const payload = (over: Partial<AttemptPayload> = {}): AttemptPayload =>
  ({ aid: "att-1", uid: "user-1", items: ["FA-COORD", "FA-COORD2"], iat: 1000, exp: 9_999_999_999_999, ...over });

test("token round-trips and binds attempt id, user id and issued items — and carries NO answers", () => {
  const tok = signAttempt(payload(), KEY);
  const v = verifyAttempt(tok, KEY, 2000);
  assert.ok(v);
  assert.equal(v!.uid, "user-1");
  assert.deepEqual(v!.items, ["FA-COORD", "FA-COORD2"]);
  // the serialized token must not contain any answer field
  assert.equal(/answerIndex|correctIndex|accepted/.test(tok), false);
});
test("a tampered signature is rejected", () => {
  const tok = signAttempt(payload(), KEY);
  const [body] = tok.split(".");
  assert.equal(verifyAttempt(`${body}.AAAA`, KEY, 2000), null);
});
test("a token signed with a different key is rejected (cross-user/forged)", () => {
  const tok = signAttempt(payload(), Buffer.from("another-key-aaaaaaaaaaaaaaaaaaaa!", "utf8"));
  assert.equal(verifyAttempt(tok, KEY, 2000), null);
});
test("an expired token is rejected", () => {
  const tok = signAttempt(payload({ exp: 5000 }), KEY);
  assert.equal(verifyAttempt(tok, KEY, 6000), null);
});
test("a tampered payload (re-issuing more items) breaks the signature", () => {
  const tok = signAttempt(payload(), KEY);
  const forged = Buffer.from(JSON.stringify(payload({ items: ["FA-COORD", "FA-COORD2", "FA-MATE"] })), "utf8").toString("base64url");
  assert.equal(verifyAttempt(`${forged}.${tok.split(".")[1]}`, KEY, 2000), null);
});

// ============ D. PER-ATTEMPT MASTERY (grader restricted to issued items) ============
const sub = (id: string): Submission => {
  const p = FOUNDATION_ASSESSMENT.find((x) => x.id === id)!;
  return p.type === "move_objective" ? { id, uci: acceptedMoves(p)[0] } : { id, answerIndex: correctIndex(p) };
};
const wrong = (id: string): Submission => {
  const p = FOUNDATION_ASSESSMENT.find((x) => x.id === id)!;
  return p.type === "move_objective" ? { id, uci: "a1a2" } : { id, answerIndex: (correctIndex(p) === 0 ? 1 : 0) };
};
test("issued attempt: two correct DISTINCT contexts demonstrate; one correct of two does NOT", () => {
  const issued = ["FA-COORD", "FA-COORD2"]; // two board_coordinates contexts
  const both = gradeFoundation([sub("FA-COORD"), sub("FA-COORD2")], issued);
  assert.equal(both.perCompetency.find((c) => c.competency === "foundation.board_coordinates")!.status, "demonstrated");
  const one = gradeFoundation([sub("FA-COORD"), wrong("FA-COORD2")], issued);
  assert.equal(one.perCompetency.find((c) => c.competency === "foundation.board_coordinates")!.status, "needs_remediation");
});
test("grading restricted to issued items ignores un-issued bank answers (no cross-attempt leakage)", () => {
  const issued = ["FA-COORD", "FA-COORD2"];
  // learner also submits a correct answer for an item NOT issued this attempt — it must not count
  const g = gradeFoundation([sub("FA-COORD"), sub("FA-COORD3")], issued);
  const c = g.perCompetency.find((x) => x.competency === "foundation.board_coordinates")!;
  assert.equal(c.contextsDemonstrated, 1, "only the issued, answered context counts");
  assert.equal(g.total, 2, "only issued items are graded");
});
test("a full issued attempt (2 correct contexts per mandatory competency) passes the chapter", () => {
  const sel = selectAttemptItems({ perCompetency: 2, rng: mulberry32(3) });
  const answers = sel.itemIds.map(sub);
  const g = gradeFoundation(answers, sel.itemIds);
  assert.equal(g.passed, true);
  assert.ok(g.perCompetency.filter((c) => c.mandatory).every((c) => c.status === "demonstrated"));
});
test("a full issued attempt failing ONE competency fails the chapter (score cannot compensate)", () => {
  const sel = selectAttemptItems({ perCompetency: 2, rng: mulberry32(5) });
  const failComp = "foundation.knight_movement";
  const answers = sel.itemIds.map((id) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.competency === failComp ? wrong(id) : sub(id));
  const g = gradeFoundation(answers, sel.itemIds);
  assert.equal(g.passed, false);
  assert.equal(g.perCompetency.find((c) => c.competency === failComp)!.status, "needs_remediation");
});

// ============ E. ROUTE CONTRACTS (server-authoritative + idempotent + no leakage) ============
const startRoute = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "start", "route.ts"), "utf8");
const attemptRoute = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "attempt", "route.ts"), "utf8");
test("/start selects server-side with a SECURE rng, signs a token, and ships no answers", () => {
  assert.ok(/getAuthedProfile\(\)/.test(startRoute), "authenticated");
  assert.ok(/randomInt/.test(startRoute), "uses node:crypto randomInt (not Math.random)");
  assert.equal(/Math\.random/.test(startRoute), false, "must not use Math.random in selection");
  assert.ok(/selectAttemptItems/.test(startRoute) && /signAttempt/.test(startRoute));
  assert.equal(/correctIndex|acceptedMoves|answerIndex/.test(startRoute), false, "no answers in issued prompts");
});
test("/attempt verifies the token, binds it to the user, restricts to issued items, and is idempotent", () => {
  assert.ok(/authorizeSubmission\(/.test(attemptRoute), "uses the shared authorization boundary");
  assert.ok(/authedUserId:\s*profile\.id/.test(attemptRoute), "binds the token to the authenticated user");
  assert.ok(/gradeFoundation\(auth\.answers,\s*auth\.issuedItems\)/.test(attemptRoute), "grades only issued items");
  assert.ok(/persistAttempt\(/.test(attemptRoute), "delegates persistence to the shared boundary");
  // idempotency + replay now live in the SHARED production boundary (also exercised by the PG harness)
  const persist = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.persistence.server.ts"), "utf8");
  assert.ok(/idempotentReplay/.test(persist), "a replay returns the stored result");
  assert.ok(/getAttempt\(userId, attemptId\)/.test(persist), "replay/read-back keyed by (userId, attemptId)");
  const adapter = readFileSync(join(import.meta.dirname, "..", "src", "features", "campaign", "lib", "foundations.persistence.supabase.server.ts"), "utf8");
  assert.ok(/onConflict:\s*"user_id,attempt_id"/.test(adapter) && /ignoreDuplicates:\s*true/.test(adapter), "DB-level idempotency on (user_id, attempt_id)");
});
test("/attempt never returns an answer key", () => {
  const ret = attemptRoute.slice(attemptRoute.lastIndexOf("NextResponse.json"));
  assert.equal(/correctIndex|answerIndex|acceptedMoves/.test(ret), false);
});
test("migration 0016 adds attempt_id + a unique index for idempotency, with no weakened policy", () => {
  const sql = readFileSync(join(import.meta.dirname, "..", "supabase", "migrations", "0016_foundation_attempt_idempotent.sql"), "utf8");
  assert.ok(/add column if not exists attempt_id uuid/.test(sql));
  assert.ok(/create unique index if not exists/.test(sql));
  assert.ok(/user_id,\s*attempt_id/.test(sql));
  assert.equal(/for (insert|update|delete)|using \(/.test(sql), false, "no RLS/policy change");
});

// ============ F. R7.3.2.1 — SCORE CONTRACT, SEMANTIC CONTEXTS, HTTP METHOD ============
test("generated assessment JSON has NO obsolete overall pass threshold; score is informational", () => {
  const j = JSON.parse(readFileSync(join(import.meta.dirname, "..", "docs", "chessmaster-foundation-assessment.json"), "utf8"));
  assert.equal("overallFloor" in j, false, "overallFloor must be removed");
  assert.equal(JSON.stringify(j).includes("passThreshold"), false, "no passThreshold anywhere in the contract");
  assert.ok(j.scoreDisplay, "scoreDisplay present");
  assert.equal(j.scoreDisplay.role, "informational_only");
  assert.equal(j.scoreDisplay.competencyGateIsAuthoritative, true);
  // pool size is distinguished from the issued-attempt size
  assert.equal(j.scoreDisplay.poolSize, FOUNDATION_ASSESSMENT.length);
  assert.equal(j.scoreDisplay.issuedItemCount, mandatory.length * 2);
  assert.notEqual(j.scoreDisplay.poolSize, j.scoreDisplay.issuedItemCount);
});
test("no competency contains two items with the SAME reasoning (type + answer + board + geometry)", () => {
  const polarity = (p: AssessPrompt) => p.type === "move_objective" ? "obj:" + (acceptedMoves(p).length ? "y" : "n") : "ans:" + correctIndex(p);
  const geometry = (p: AssessPrompt) => p.moveUci ?? p.target ?? p.square ?? "pos";
  const board = (p: AssessPrompt) => (p.fen ?? "-").split(" ")[0];
  for (const c of mandatory) {
    const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id);
    const sigs = items.map((p) => `${p.type}|${polarity(p)}|${geometry(p)}|${board(p)}`);
    assert.equal(new Set(sigs).size, sigs.length, `${c.id} has a semantic near-duplicate: ${sigs.join(" , ")}`);
  }
});
test("/api/foundations/start is POST-only; no stale GET reference in the token schema", () => {
  const startRoute2 = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "foundations", "start", "route.ts"), "utf8");
  assert.ok(/export async function POST/.test(startRoute2), "exports POST");
  assert.equal(/export async function GET/.test(startRoute2), false, "does not export GET");
  const schemaSrc = readFileSync(join(import.meta.dirname, "..", "src", "lib", "validation", "schemas.ts"), "utf8");
  const fa = schemaSrc.slice(schemaSrc.indexOf("foundationAttemptSchema"), schemaSrc.indexOf("questClaimSchema"));
  assert.equal(/GET \/api\/foundations\/start/.test(fa), false, "no stale GET reference");
  assert.ok(/POST \/api\/foundations\/start/.test(fa), "schema comment says POST");
});

// ============ G0. R7.3.2.2.1 — SELECTABLE-ITEM AXIS INTEGRITY (FA-COORD3 class) ============
test("EVERY selectable item has a valid evidence axis belonging to its competency's requiredAxes", () => {
  for (const p of FOUNDATION_ASSESSMENT) {
    const c = COMPETENCIES.find((x) => x.id === p.competency)!;
    assert.ok(p.axis && p.axis !== "unassigned", `${p.id} has no assigned axis (${JSON.stringify(p.axis)})`);
    assert.ok(c.requiredAxes.includes(p.axis), `${p.id} axis "${p.axis}" not in ${p.competency} requiredAxes [${c.requiredAxes}]`);
  }
});
test("FA-COORD3 (square a1) is classified as a DARK square, matching its server-graded colour", () => {
  const it = FOUNDATION_ASSESSMENT.find((p) => p.id === "FA-COORD3")!;
  assert.equal(it.square, "a1");
  assert.equal(it.axis, "dark", "a1 is a dark square; its axis must be dark");
});
test("board_coordinates offers >=2 light and >=2 dark selectable items (both colours rotate)", () => {
  const bc = FOUNDATION_ASSESSMENT.filter((p) => p.competency === "foundation.board_coordinates");
  assert.ok(bc.filter((p) => p.axis === "light").length >= 2, "needs >=2 light squares");
  assert.ok(bc.filter((p) => p.axis === "dark").length >= 2, "needs >=2 dark squares");
});
test("no issued attempt ever contains an item with an invalid/unassigned axis (500 seeds)", () => {
  for (let s = 0; s < 500; s++) {
    const sel = selectAttemptItems({ rng: mulberry32(s), exclude: s % 2 ? selectAttemptItems({ rng: mulberry32(s + 99) }).itemIds : [] });
    for (const id of sel.itemIds) {
      const p = FOUNDATION_ASSESSMENT.find((x) => x.id === id)!;
      const c = COMPETENCIES.find((x) => x.id === p.competency)!;
      assert.ok(p.axis && p.axis !== "unassigned" && c.requiredAxes.includes(p.axis), `seed ${s} issued invalid-axis item ${id} (${p.axis})`);
    }
  }
});

// ============ G. R7.3.2.2 — EXHAUSTIVE EVIDENCE-AXIS COVERAGE ============
const axisById = (id: string) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.axis;
// A competency's issued pair is VALID iff distinct contexts AND every requiredAxis covered.
function validPairsFor(compId: string, axes: string[]): Set<string> {
  const items = FOUNDATION_ASSESSMENT.filter((p) => p.competency === compId);
  const valid = new Set<string>();
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const pair = [items[a], items[b]];
    if (pair[0].contextKey === pair[1].contextKey) continue;
    const covered = new Set(pair.map((p) => p.axis));
    if (axes.every((x) => covered.has(x))) valid.add([items[a].id, items[b].id].sort().join("+"));
  }
  return valid;
}
test("every mandatory competency defines requiredAxes that its pool can satisfy", () => {
  for (const c of mandatory) {
    assert.ok(c.requiredAxes.length >= 2, `${c.id} should define >=2 required axes`);
    const axes = new Set(FOUNDATION_ASSESSMENT.filter((p) => p.competency === c.id).map((p) => p.axis));
    for (const a of c.requiredAxes) assert.ok(axes.has(a), `${c.id} pool lacks an item for required axis ${a}`);
    assert.ok(validPairsFor(c.id, c.requiredAxes).size >= 1, `${c.id} has no valid issuable pair`);
  }
});
test("the selector NEVER emits an invalid pair, across 400 seeds × varied previous attempts", () => {
  const valid: Record<string, Set<string>> = {};
  for (const c of mandatory) valid[c.id] = validPairsFor(c.id, c.requiredAxes);
  let checks = 0;
  for (let s = 0; s < 400; s++) {
    // vary the "previous attempt" to try to force the selector into an invalid pick
    const prev = s % 4 === 0 ? [] : selectAttemptItems({ rng: mulberry32(s * 13 + 1) }).itemIds;
    const sel = selectAttemptItems({ rng: mulberry32(s), exclude: prev });
    assert.equal(sel.shortfalls.length, 0, `seed ${s} shortfall: ${sel.shortfalls.join()}`);
    for (const c of mandatory) {
      const ids = sel.byCompetency[c.id];
      assert.equal(ids.length, 2);
      assert.equal(new Set(ids.map((id) => FOUNDATION_ASSESSMENT.find((p) => p.id === id)!.contextKey)).size, 2, `${c.id} non-distinct`);
      const key = [...ids].sort().join("+");
      assert.ok(valid[c.id].has(key), `seed ${s} ${c.id} emitted INVALID pair ${key}`);
      for (const ax of c.requiredAxes) assert.ok(ids.some((id) => axisById(id) === ax), `seed ${s} ${c.id} missing axis ${ax}`);
      checks++;
    }
  }
  assert.ok(checks >= 400 * mandatory.length);
});
test("coverage BEATS rotation: even when the last attempt used a required-axis item, coverage still holds", () => {
  // board_coordinates: force-exclude the only... (there are 2 light, 2 dark) — exclude 1 light + 1 dark,
  // the selector must still issue one light + one dark from the remaining fresh items.
  const bc = "foundation.board_coordinates";
  const lights = FOUNDATION_ASSESSMENT.filter((p) => p.competency === bc && p.axis === "light").map((p) => p.id);
  const darks = FOUNDATION_ASSESSMENT.filter((p) => p.competency === bc && p.axis === "dark").map((p) => p.id);
  const sel = selectAttemptItems({ rng: mulberry32(9), exclude: [lights[0], darks[0]] });
  const ids = sel.byCompetency[bc];
  assert.ok(ids.some((id) => axisById(id) === "light") && ids.some((id) => axisById(id) === "dark"), "both colours still covered");
});
test("insufficient pool (a required axis missing) fails EXPLICITLY, not silently", () => {
  // drop the only not-check item -> check competency can no longer cover both axes
  const crippled = FOUNDATION_ASSESSMENT.filter((p) => !(p.competency === "foundation.check" && p.axis === "not-check"));
  const sel = selectAttemptItems({ rng: mulberry32(1), bank: crippled });
  assert.ok(sel.shortfalls.some((s) => s.startsWith("foundation.check") && /axes/.test(s)), `expected an axis shortfall, got: ${sel.shortfalls.join(" | ")}`);
});

// ============ H. ROUTE-BOUNDARY AUTHORIZATION (R7.3.2.2) — the production-shared decision ============
// authorizeSubmission is the exact boundary /api/foundations/attempt uses to accept/reject a submission
// BEFORE anything is graded or persisted. Testing it verifies the real route decision, not just the
// token primitive.
const KEY2 = Buffer.from("route-boundary-key-32byteslong!!", "utf8");
const tokenFor = (uid: string, items: string[], over: Partial<AttemptPayload> = {}) =>
  signAttempt({ aid: "att-x", uid, items, iat: 1000, exp: 9_999_999_999_999, ...over }, KEY2);

test("route boundary REJECTS a token issued to another user (cross-user) with 403", () => {
  const tok = tokenFor("userA", ["FA-COORD", "FA-COORD2"]);
  const r = authorizeSubmission({ token: tok, authedUserId: "userB", answers: [{ id: "FA-COORD" }], key: KEY2, nowMs: 2000 });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 403);
});
test("route boundary REJECTS an expired token (422) and a tampered signature (422)", () => {
  const expired = tokenFor("userA", ["FA-COORD"], { exp: 5000 });
  assert.equal(authorizeSubmission({ token: expired, authedUserId: "userA", answers: [{ id: "FA-COORD" }], key: KEY2, nowMs: 6000 }).ok, false);
  const good = tokenFor("userA", ["FA-COORD"]);
  const tampered = good.split(".")[0] + ".AAAA";
  const r = authorizeSubmission({ token: tampered, authedUserId: "userA", answers: [{ id: "FA-COORD" }], key: KEY2, nowMs: 2000 });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 422);
});
test("route boundary REJECTS a token signed with an unknown key (422)", () => {
  const foreign = signAttempt({ aid: "a", uid: "userA", items: ["FA-COORD"], iat: 1, exp: 9_999_999_999_999 }, Buffer.from("different-key-aaaaaaaaaaaaaaaaaa!", "utf8"));
  assert.equal(authorizeSubmission({ token: foreign, authedUserId: "userA", answers: [{ id: "FA-COORD" }], key: KEY2, nowMs: 2000 }).ok, false);
});
test("route boundary REJECTS an answer for an item NOT issued by the token (422)", () => {
  const tok = tokenFor("userA", ["FA-COORD", "FA-COORD2"]);
  const r = authorizeSubmission({ token: tok, authedUserId: "userA", answers: [{ id: "FA-MATE" /* not issued */ }], key: KEY2, nowMs: 2000 });
  assert.equal(r.ok, false);
  assert.equal((r as { status: number }).status, 422);
});
test("route boundary ACCEPTS a valid same-user submission and returns the issued items + attempt id", () => {
  const tok = tokenFor("userA", ["FA-COORD", "FA-COORD2"]);
  const r = authorizeSubmission({ token: tok, authedUserId: "userA", answers: [{ id: "FA-COORD" }, { id: "FA-COORD2" }], key: KEY2, nowMs: 2000 });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.attemptId, "att-x"); assert.deepEqual(r.issuedItems, ["FA-COORD", "FA-COORD2"]); }
});
test("generated JSON version model is split and issuedItemCount derives from the config (no drift)", () => {
  const j = JSON.parse(readFileSync(join(import.meta.dirname, "..", "docs", "chessmaster-foundation-assessment.json"), "utf8"));
  assert.equal("phase" in j, false, "the overloaded single `phase` field must be gone");
  assert.ok(j.version && j.version.assessmentContractVersion && j.version.implementationPhase && j.version.auditVersion, "version split into 3 meanings");
  // issuedItemCount is derived, not a stale literal
  assert.equal(j.scoreDisplay.issuedItemCount, j.scoreDisplay.issuedContextsPerCompetency * j.scoreDisplay.mandatoryCompetencies);
  assert.equal(j.scoreDisplay.mandatoryCompetencies, mandatory.length);
  assert.equal(j.scoreDisplay.poolSize, FOUNDATION_ASSESSMENT.length);
  assert.notEqual(j.scoreDisplay.poolSize, j.scoreDisplay.issuedItemCount);
});
test("the /attempt route calls authorizeSubmission BEFORE grading/persisting (reject = no write)", () => {
  // structural guarantee: in route.ts the authorize check and its early return precede gradeFoundation/persistAttempt
  const iAuth = attemptRoute.indexOf("authorizeSubmission(");
  const iReject = attemptRoute.indexOf("if (!auth.ok)");
  const iGrade = attemptRoute.indexOf("gradeFoundation(");
  const iPersist = attemptRoute.indexOf("persistAttempt(");
  assert.ok(iAuth > 0 && iReject > iAuth && iGrade > iReject && iPersist > iGrade, "authorize+reject must precede grade+persist");
});

// ensure these helpers are considered used by strict configs
void (FOUNDATION_ASSESSMENT as AssessPrompt[]);
