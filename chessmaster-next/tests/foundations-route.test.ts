import { test } from "node:test";
import assert from "node:assert/strict";
import { handleAttempt, type AttemptHandlerDeps } from "@/app/api/foundations/attempt/route.ts";
import { signAttempt } from "@/features/campaign/lib/foundations.token.server.ts";
import { selectAttemptItems } from "@/features/campaign/lib/foundations.select.ts";
import { correctIndex, acceptedMoves, type Submission } from "@/features/campaign/lib/foundations.answers.server.ts";
import { FOUNDATION_ASSESSMENT } from "@/features/campaign/lib/foundations.ts";
import type { AttemptRepo, StoredAttemptRow } from "@/features/campaign/lib/foundations.persistence.server.ts";

// R7.3.2.2.1 Workstream B: exercise the REAL /api/foundations/attempt control flow (handleAttempt),
// with test-only auth + an in-memory repo injected at the infrastructure boundary. The shared
// authorizeSubmission / gradeFoundation / persistAttempt functions all execute — no route logic is
// re-implemented in the test.
const KEY = Buffer.from("route-integration-key-32byteslen", "utf8");
const mulberry = (s: number) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

interface Store { attempts: Map<string, StoredAttemptRow>; assessments: Map<string, { passed: boolean; score: number }> }
function memRepo(store: Store): AttemptRepo {
  return {
    async getAttempt(u, a) { return store.attempts.get(`${u}|${a}`) ?? null; },
    async insertAttemptIfAbsent(row) { const k = `${row.userId}|${row.attemptId}`; if (!store.attempts.has(k)) store.attempts.set(k, { passed: row.passed, score: row.score, total: row.total, competencies: row.competencies, items: row.items }); },
    async getAssessment(u) { return store.assessments.get(u) ?? null; },
    async upsertAssessmentPass(u, score) { const e = store.assessments.get(u); store.assessments.set(u, { passed: true, score: Math.max(score, e?.score ?? 0) }); },
  };
}
const depsFor = (userId: string | null, store: Store): AttemptHandlerDeps => ({
  getProfile: async () => (userId ? { id: userId } : null), signingKey: () => KEY, makeRepo: () => memRepo(store),
});
const makeReq = (bodyObj: unknown) => new Request("http://test/api/foundations/attempt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyObj) });
const correctAnswersFor = (ids: string[]): Submission[] => ids.map((id) => {
  const p = FOUNDATION_ASSESSMENT.find((x) => x.id === id)!;
  return p.type === "move_objective" ? { id, uci: acceptedMoves(p)[0] } : { id, answerIndex: correctIndex(p) };
});
function tokenFor(uid: string, items: string[], over: Record<string, unknown> = {}) {
  return signAttempt({ aid: `att-${uid}`, uid, items, iat: 1000, exp: 9_999_999_999_999, ...over }, KEY);
}

test("REAL route: a full correct submission for user A passes and persists (then replay is idempotent)", async () => {
  const store: Store = { attempts: new Map(), assessments: new Map() };
  const sel = selectAttemptItems({ rng: mulberry(1) });
  const token = tokenFor("userA", sel.itemIds);
  const res = await handleAttempt(makeReq({ token, answers: correctAnswersFor(sel.itemIds) }), depsFor("userA", store));
  assert.equal(res.status, 200);
  const body = res.body as { passed: boolean; score: number; idempotentReplay: boolean };
  assert.equal(body.passed, true);
  assert.equal(store.assessments.get("userA")!.passed, true);
  // replay the SAME token as the SAME user -> stored result returned, no change
  const replay = await handleAttempt(makeReq({ token, answers: correctAnswersFor(sel.itemIds) }), depsFor("userA", store));
  assert.equal((replay.body as { idempotentReplay: boolean }).idempotentReplay, true);
  assert.equal(store.attempts.size, 1, "replay added no new attempt row");
});

test("REAL route: user B submitting user A's valid token is REJECTED (403) BEFORE any write", async () => {
  const store: Store = { attempts: new Map(), assessments: new Map() };
  const sel = selectAttemptItems({ rng: mulberry(2) });
  const token = tokenFor("userA", sel.itemIds);
  // user A completes a legitimate attempt
  await handleAttempt(makeReq({ token, answers: correctAnswersFor(sel.itemIds) }), depsFor("userA", store));
  const aAttemptSnap = JSON.stringify([...store.attempts.entries()]);
  const aAssessSnap = JSON.stringify([...store.assessments.entries()]);
  const attemptsBefore = store.attempts.size;

  // user B authenticates and replays A's token
  const res = await handleAttempt(makeReq({ token, answers: correctAnswersFor(sel.itemIds) }), depsFor("userB", store));

  assert.equal(res.status, 403, "cross-user submission must be rejected with 403");
  const body = res.body as { error: string };
  assert.ok(body.error && typeof body.error === "string");
  // no answer key / accepted-move leakage in the error response
  assert.equal(/answerIndex|correctIndex|accepted|uci/i.test(JSON.stringify(res.body)), false);
  // NO write for user B; user A's records byte-for-byte unchanged
  assert.equal(store.attempts.has("userB|att-userA"), false, "no attempt row for user B");
  assert.equal(store.assessments.has("userB"), false, "no assessment row for user B");
  assert.equal(store.attempts.size, attemptsBefore, "attempt count unchanged");
  assert.equal(JSON.stringify([...store.attempts.entries()]), aAttemptSnap, "user A's attempt unchanged");
  assert.equal(JSON.stringify([...store.assessments.entries()]), aAssessSnap, "user A's pass latch + score unchanged");
});

test("REAL route: unauthenticated request is 401 (no write)", async () => {
  const store: Store = { attempts: new Map(), assessments: new Map() };
  const token = tokenFor("userA", ["FA-COORD", "FA-COORD2"]);
  const res = await handleAttempt(makeReq({ token, answers: [{ id: "FA-COORD", answerIndex: 0 }] }), depsFor(null, store));
  assert.equal(res.status, 401);
  assert.equal(store.attempts.size, 0);
});

test("REAL route: expired / tampered / unknown-key / un-issued-item are all rejected before write", async () => {
  const store: Store = { attempts: new Map(), assessments: new Map() };
  const expired = tokenFor("userA", ["FA-COORD"], { exp: 5000 });
  assert.equal((await handleAttempt(makeReq({ token: expired, answers: [{ id: "FA-COORD", answerIndex: 0 }] }), depsFor("userA", store))).status, 422);
  const good = tokenFor("userA", ["FA-COORD"]);
  const tampered = good.split(".")[0] + ".AAAA";
  assert.equal((await handleAttempt(makeReq({ token: tampered, answers: [{ id: "FA-COORD", answerIndex: 0 }] }), depsFor("userA", store))).status, 422);
  const foreign = signAttempt({ aid: "a", uid: "userA", items: ["FA-COORD"], iat: 1, exp: 9_999_999_999_999 }, Buffer.from("another-key-aaaaaaaaaaaaaaaaaaaa!", "utf8"));
  assert.equal((await handleAttempt(makeReq({ token: foreign, answers: [{ id: "FA-COORD", answerIndex: 0 }] }), depsFor("userA", store))).status, 422);
  const unissued = tokenFor("userA", ["FA-COORD", "FA-COORD2"]);
  assert.equal((await handleAttempt(makeReq({ token: unissued, answers: [{ id: "FA-MATE", answerIndex: 0 }] }), depsFor("userA", store))).status, 422);
  assert.equal(store.attempts.size, 0, "no rejected request wrote anything");
});

test("REAL route: malformed body / invalid JSON are rejected", async () => {
  const store: Store = { attempts: new Map(), assessments: new Map() };
  const badJson = new Request("http://test", { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
  assert.equal((await handleAttempt(badJson, depsFor("userA", store))).status, 400);
  // missing token field -> schema rejects (422)
  assert.equal((await handleAttempt(makeReq({ answers: [{ id: "FA-COORD", answerIndex: 0 }] }), depsFor("userA", store))).status, 422);
});
