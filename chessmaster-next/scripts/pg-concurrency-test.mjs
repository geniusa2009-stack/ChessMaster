// R7.3.2.1 REAL PostgreSQL concurrency integration test for the CH01 attempt-evidence persistence.
// It applies the ACTUAL migrations 0013–0016 (structural DDL; the Supabase-only RLS/policy/auth lines
// are stripped because auth.uid()/is_admin() are runtime functions — RLS is asserted separately by the
// unit tests) to a DISPOSABLE database, then exercises the exact write path the submit route uses:
//   - attempt evidence:  INSERT ... ON CONFLICT (user_id, attempt_id) DO NOTHING   (= supabase upsert ignoreDuplicates)
//   - pass latch:        the route's gated upsert (write passed=true only when grade.passed||existing, score=max)
// Separate connections and a synchronization barrier force a genuine overlap at the unique-index
// conflict point. Run via scripts/run-pg-concurrency.sh (which boots an isolated postgres first).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
// `pg` is resolved from a configurable base so this harness needs NO project dependency: the runner
// installs `pg` + `embedded-postgres` in a throwaway dir and points PG_REQUIRE_BASE at it.
const req = createRequire(process.env.PG_REQUIRE_BASE || import.meta.url);
const { Client } = req("pg");

const HERE = dirname(fileURLToPath(import.meta.url));
const mig = (f) => readFileSync(join(HERE, "..", "supabase", "migrations", f), "utf8");
const CONN = { host: process.env.PGHOST || "/tmp/pgrun", port: Number(process.env.PGPORT || 54329), user: "postgres", database: "cm_test" };
const results = [];
const ok = (name, cond, detail = "") => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"} | ${name}${detail ? " — " + detail : ""}`); };

// Strip Supabase-runtime-only statements (RLS enable, policies, auth.uid/is_admin). Keep all
// structural DDL (tables, columns, indexes, unique index, pk) verbatim from the real migrations.
function structuralOnly(sql) {
  return sql
    .replace(/alter table[^;]*enable row level security;/gis, "")
    .replace(/drop policy[^;]*;/gis, "")
    .replace(/create policy[\s\S]*?;/gis, "")
    .replace(/comment on [\s\S]*?';/gis, ""); // to the closing quote (comment text may contain ';')
}

async function applySchema(c) {
  // minimal stand-in for the referenced auth table (FK target); real app uses Supabase profiles
  await c.query(`create table if not exists public.profiles (id uuid primary key);`);
  for (const f of ["0013_foundation_assessment.sql", "0014_foundation_attempt.sql", "0015_foundation_attempt_items.sql", "0016_foundation_attempt_idempotent.sql", "0017_foundation_latch_pass.sql"]) {
    await c.query(structuralOnly(mig(f)));
  }
}

// Faithful replica of the submit route's attempt-evidence write (supabase upsert ignoreDuplicates).
async function writeAttempt(c, { uid, aid, passed, score, total, competencies, items }) {
  const r = await c.query(
    `insert into public.foundation_attempt (user_id, assessment_id, attempt_id, passed, score, total, competencies, items)
     values ($1,'CH01',$2,$3,$4,$5,$6,$7)
     on conflict (user_id, attempt_id) do nothing
     returning id`,
    [uid, aid, passed, score, total, JSON.stringify(competencies), JSON.stringify(items)],
  );
  return r.rowCount; // 1 = inserted, 0 = duplicate ignored
}
const seedUser = async (c, id) => c.query(`insert into public.profiles(id) values ($1) on conflict do nothing`, [id]);
const comp = (status) => [{ competency: "foundation.check", status }];
const items = (correct) => [{ id: "FA-CHECK", competency: "foundation.check", contextKey: "is-check", correct }];

async function main() {
  const admin = new Client(CONN); await admin.connect();
  const ver = (await admin.query("show server_version")).rows[0].server_version;
  console.log("PostgreSQL", ver, "db", CONN.database);
  await applySchema(admin);
  // confirm the unique index from migration 0016 actually exists in the DB catalog
  const idx = await admin.query(`select indexdef from pg_indexes where tablename='foundation_attempt' and indexname='uniq_foundation_attempt_user_attempt'`);
  ok("0016 unique index exists in pg_catalog (user_id, attempt_id)", idx.rowCount === 1 && /user_id.*attempt_id/s.test(idx.rows[0]?.indexdef || ""), idx.rows[0]?.indexdef);

  const userA = randomUUID(), userB = randomUUID();
  await seedUser(admin, userA); await seedUser(admin, userB);

  // Production persistence boundary + a thin pg-backed AttemptRepo. ALL latch scenarios call the real
  // persistAttempt() and the real atomic function foundation_latch_pass (migration 0017) — no
  // re-implemented GREATEST in this harness.
  const { persistAttempt } = await import("@/features/campaign/lib/foundations.persistence.server.ts");
  const pgRepo = (client) => ({
    async getAttempt(userId, attemptId) {
      const { rows } = await client.query(`select passed, score, total, competencies, items from foundation_attempt where user_id=$1 and attempt_id=$2`, [userId, attemptId]);
      return rows[0] ? { passed: rows[0].passed, score: rows[0].score, total: rows[0].total, competencies: rows[0].competencies, items: rows[0].items } : null;
    },
    async insertAttemptIfAbsent(row) {
      await client.query(`insert into foundation_attempt (user_id, assessment_id, attempt_id, passed, score, total, competencies, items) values ($1,'CH01',$2,$3,$4,$5,$6,$7) on conflict (user_id, attempt_id) do nothing`,
        [row.userId, row.attemptId, row.passed, row.score, row.total, JSON.stringify(row.competencies), JSON.stringify(row.items)]);
    },
    async getAssessment(userId) {
      const { rows } = await client.query(`select passed, score from foundation_assessment where user_id=$1 and assessment_id='CH01'`, [userId]);
      return rows[0] ? { passed: rows[0].passed, score: rows[0].score } : null;
    },
    async upsertAssessmentPass(userId, score, total) {
      // calls the REAL production atomic function (migration 0017) — NOT a re-implemented GREATEST
      await client.query(`select public.foundation_latch_pass($1,'CH01',$2,$3)`, [userId, score, total]);
    },
  });
  const grade = (passed, score) => ({
    passed, score: score ?? (passed ? 32 : 10), total: 32, overallFloorMet: passed,
    perCompetency: [{ competency: "foundation.check", status: passed ? "demonstrated" : "needs_remediation", mandatory: true, lessonId: "CH01-L006", minContexts: 2, contextsDemonstrated: passed ? 2 : 1 }],
    perItem: [{ id: "FA-CHECK", competency: "foundation.check", contextKey: "is-check", correct: passed, answered: true }],
    remediation: passed ? [] : [{ competency: "foundation.check", lessonId: "CH01-L006" }],
  });

  // ---- Scenario 1: same attempt, two simultaneous submissions -> single row ----
  {
    const aid = randomUUID();
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    const [r1, r2] = await Promise.all([
      writeAttempt(c1, { uid: userA, aid, passed: true, score: 32, total: 32, competencies: comp("demonstrated"), items: items(true) }),
      writeAttempt(c2, { uid: userA, aid, passed: true, score: 32, total: 32, competencies: comp("demonstrated"), items: items(true) }),
    ]);
    const cnt = (await admin.query(`select count(*)::int n from foundation_attempt where user_id=$1 and attempt_id=$2`, [userA, aid])).rows[0].n;
    ok("S1 concurrent same-attempt submit -> exactly ONE row", cnt === 1, `rows=${cnt}, inserted=[${r1},${r2}]`);
    ok("S1 exactly one insert won; the other was ignored", r1 + r2 === 1, `inserted sum=${r1 + r2}`);
    await c1.end(); await c2.end();
  }

  // ---- Scenario 2: overlapping transactions — DIRECT lock-wait evidence via pg_blocking_pids ----
  {
    const aid = randomUUID();
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query("begin"); await c2.query("begin");
    // c1 inserts the key and holds the transaction open (uncommitted)
    await c1.query(`insert into foundation_attempt (user_id, assessment_id, attempt_id, passed, score, total) values ($1,'CH01',$2,true,32,32)`, [userA, aid]);
    // c2 attempts the same key; it must BLOCK on the unique index until c1 resolves
    let c2Resolved = false;
    const c2Promise = c2.query(`insert into foundation_attempt (user_id, assessment_id, attempt_id, passed, score, total) values ($1,'CH01',$2,true,99,99) on conflict (user_id, attempt_id) do nothing returning id`, [userA, aid])
      .then((r) => { c2Resolved = true; return r.rowCount; });
    // Poll (bounded) the catalog until c2's backend is reported as BLOCKED BY c1 — this is the actual
    // evidence, not the timeout. pg_blocking_pids(pid2) must contain pid1 while c1 holds the key.
    let blockers = [], waitState = null, waited = 0;
    while (waited < 5000) {
      const q = await admin.query(
        `select wait_event_type, state, pg_blocking_pids($1) as blockers from pg_stat_activity where pid=$1`, [pid2]);
      blockers = q.rows[0]?.blockers ?? []; waitState = q.rows[0]?.wait_event_type;
      if (blockers.includes(pid1)) break;
      await new Promise((r) => setTimeout(r, 50)); waited += 50;
    }
    const observedBlocked = blockers.includes(pid1) && c2Resolved === false;
    ok("S2 pg_blocking_pids(c2) reports c1 as the blocker while c1 holds the key", observedBlocked,
       `pid1=${pid1} pid2=${pid2} blockers=[${blockers}] wait=${waitState} c2Resolved=${c2Resolved}`);
    await c1.query("commit");                        // release the conflict
    const c2Rows = await c2Promise; await c2.query("commit");
    const row = (await admin.query(`select score from foundation_attempt where user_id=$1 and attempt_id=$2`, [userA, aid])).rows;
    ok("S2 c2 resumed after c1 committed and inserted NO row (conflict ignored)", c2Resolved === true && c2Rows === 0, `c2 inserted=${c2Rows}`);
    ok("S2 stored score is the first writer's (99 did not overwrite)", row.length === 1 && row[0].score === 32, JSON.stringify(row));
    await c1.end(); await c2.end();
  }

  // ---- Scenario 3: two DIFFERENT attempts for the same user -> both persist, isolated ----
  {
    const aid1 = randomUUID(), aid2 = randomUUID();
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    await Promise.all([
      writeAttempt(c1, { uid: userA, aid: aid1, passed: false, score: 10, total: 32, competencies: comp("needs_remediation"), items: items(false) }),
      writeAttempt(c2, { uid: userA, aid: aid2, passed: true, score: 32, total: 32, competencies: comp("demonstrated"), items: items(true) }),
    ]);
    const rows = (await admin.query(`select attempt_id, score from foundation_attempt where user_id=$1 and attempt_id = any($2)`, [userA, [aid1, aid2]])).rows;
    ok("S3 two distinct attempts both persist (unique index does not reject the 2nd)", rows.length === 2, `rows=${rows.length}`);
    const byId = Object.fromEntries(rows.map((r) => [r.attempt_id, r.score]));
    ok("S3 evidence isolated per attempt (no borrowing)", byId[aid1] === 10 && byId[aid2] === 32, JSON.stringify(byId));
    await c1.end(); await c2.end();
  }

  // ---- Scenario 4: concurrent pass + fail latch (production persistAttempt) -> pass never downgraded ----
  {
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    await Promise.all([
      persistAttempt(pgRepo(c1), { userId: userB, attemptId: randomUUID(), grade: grade(true, 32) }),  // pass
      persistAttempt(pgRepo(c2), { userId: userB, attemptId: randomUUID(), grade: grade(false, 5) }),  // fail, same time
    ]);
    let s = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [userB])).rows[0];
    ok("S4 concurrent pass+fail -> latch is passed=true", s?.passed === true, JSON.stringify(s));
    await persistAttempt(pgRepo(admin), { userId: userB, attemptId: randomUUID(), grade: grade(false, 1) }); // later fail
    s = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [userB])).rows[0];
    ok("S4 later failing attempt cannot downgrade a prior pass", s?.passed === true && s?.score === 32, JSON.stringify(s));
    await c1.end(); await c2.end();
  }

  // ---- Scenario 5: replay after completion returns the original stored row ----
  {
    const aid = randomUUID();
    const c = new Client(CONN); await c.connect();
    const first = await writeAttempt(c, { uid: userA, aid, passed: true, score: 32, total: 32, competencies: comp("demonstrated"), items: items(true) });
    const original = (await admin.query(`select passed, score, items from foundation_attempt where user_id=$1 and attempt_id=$2`, [userA, aid])).rows[0];
    // replay with DIFFERENT (tampered) payload — must be ignored, original preserved
    const replay = await writeAttempt(c, { uid: userA, aid, passed: false, score: 0, total: 32, competencies: comp("needs_remediation"), items: items(false) });
    const after = (await admin.query(`select passed, score, items from foundation_attempt where user_id=$1 and attempt_id=$2`, [userA, aid])).rows[0];
    ok("S5 replay inserts nothing (idempotent)", first === 1 && replay === 0, `first=${first} replay=${replay}`);
    ok("S5 original stored outcome is unchanged by the replay", JSON.stringify(original) === JSON.stringify(after), `before=${JSON.stringify(original)} after=${JSON.stringify(after)}`);
    await c.end();
  }

  // ---- Scenario 6: cross-user attempt id does not corrupt the owner's row ----
  {
    const aid = randomUUID();
    const c = new Client(CONN); await c.connect();
    await writeAttempt(c, { uid: userA, aid, passed: true, score: 32, total: 32, competencies: comp("demonstrated"), items: items(true) });
    // user B writing the SAME attempt_id lands on a SEPARATE row (unique key is (user_id, attempt_id));
    // the real route rejects this at the token check (payload.uid !== profile.id) BEFORE the DB — asserted in unit tests.
    await writeAttempt(c, { uid: userB, aid, passed: false, score: 0, total: 32, competencies: comp("needs_remediation"), items: items(false) });
    const a = (await admin.query(`select passed, score from foundation_attempt where user_id=$1 and attempt_id=$2`, [userA, aid])).rows[0];
    ok("S6 another user's write with the same attempt_id does NOT overwrite the owner's evidence", a?.passed === true && a?.score === 32, JSON.stringify(a));
    await c.end();
  }

  // ============ PRODUCTION-PATH scenarios: exercise the SHARED persistAttempt() used by the route ============
  // (persistAttempt + pgRepo + grade are defined at the top of main; they call the real production logic
  //  and the real atomic function against this disposable PostgreSQL — not a re-implemented algorithm.)

  // ---- P1: first submission persists; a replay returns the stored result and adds no row ----
  {
    const uid = randomUUID(); await seedUser(admin, uid); const aid = randomUUID();
    const c = new Client(CONN); await c.connect(); const repo = pgRepo(c);
    const r1 = await persistAttempt(repo, { userId: uid, attemptId: aid, grade: grade(true) });
    // replay with a TAMPERED (failing) grade for the same attempt id
    const r2 = await persistAttempt(repo, { userId: uid, attemptId: aid, grade: grade(false) });
    const cnt = (await admin.query(`select count(*)::int n from foundation_attempt where user_id=$1 and attempt_id=$2`, [uid, aid])).rows[0].n;
    ok("P1 production persistAttempt: first=not-replay, second=replay", r1.idempotentReplay === false && r2.idempotentReplay === true, `r1.replay=${r1.idempotentReplay} r2.replay=${r2.idempotentReplay}`);
    ok("P1 replay returns the ORIGINAL stored result (tampered grade ignored)", r2.passed === true && r2.score === 32, JSON.stringify({ passed: r2.passed, score: r2.score }));
    ok("P1 exactly one evidence row persisted", cnt === 1, `rows=${cnt}`);
    await c.end();
  }

  // ---- P2: concurrent duplicate submissions via production code -> one row, consistent result ----
  {
    const uid = randomUUID(); await seedUser(admin, uid); const aid = randomUUID();
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    const [a, b] = await Promise.all([
      persistAttempt(pgRepo(c1), { userId: uid, attemptId: aid, grade: grade(true) }),
      persistAttempt(pgRepo(c2), { userId: uid, attemptId: aid, grade: grade(true) }),
    ]);
    const cnt = (await admin.query(`select count(*)::int n from foundation_attempt where user_id=$1 and attempt_id=$2`, [uid, aid])).rows[0].n;
    ok("P2 concurrent persistAttempt of same attempt -> exactly ONE row", cnt === 1, `rows=${cnt}`);
    ok("P2 both callers agree on the stored outcome", a.passed === true && b.passed === true && a.score === b.score, JSON.stringify({ a: a.score, b: b.score }));
    await c1.end(); await c2.end();
  }

  // ---- P3: pass-latch monotonicity through production code (concurrent + later fail) ----
  {
    const uid = randomUUID(); await seedUser(admin, uid);
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    await Promise.all([
      persistAttempt(pgRepo(c1), { userId: uid, attemptId: randomUUID(), grade: grade(true) }),   // pass
      persistAttempt(pgRepo(c2), { userId: uid, attemptId: randomUUID(), grade: grade(false) }),  // fail, same time
    ]);
    let s = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [uid])).rows[0];
    ok("P3 concurrent pass+fail via production code -> latch passed=true", s?.passed === true, JSON.stringify(s));
    await persistAttempt(pgRepo(admin), { userId: uid, attemptId: randomUUID(), grade: grade(false) }); // later fail
    s = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [uid])).rows[0];
    ok("P3 a later failing attempt cannot downgrade the pass (production logic)", s?.passed === true && s?.score === 32, JSON.stringify(s));
    await c1.end(); await c2.end();
  }

  // ---- P4: distinct attempts for one user stay isolated through production code ----
  {
    const uid = randomUUID(); await seedUser(admin, uid); const aid1 = randomUUID(), aid2 = randomUUID();
    const c = new Client(CONN); await c.connect(); const repo = pgRepo(c);
    await persistAttempt(repo, { userId: uid, attemptId: aid1, grade: grade(false) });
    await persistAttempt(repo, { userId: uid, attemptId: aid2, grade: grade(true) });
    const rows = (await admin.query(`select attempt_id, score from foundation_attempt where user_id=$1`, [uid])).rows;
    const byId = Object.fromEntries(rows.map((r) => [r.attempt_id, r.score]));
    ok("P4 two attempts isolated through production persistAttempt", rows.length === 2 && byId[aid1] === 10 && byId[aid2] === 32, JSON.stringify(byId));
    await c.end();
  }

  // ---- D1: route-equivalent flow — a cross-user token is rejected BEFORE any DB write ----
  {
    const { authorizeSubmission, signAttempt } = await import("@/features/campaign/lib/foundations.token.server.ts");
    const key = Buffer.from("pg-harness-boundary-key-32bytes!", "utf8");
    const uidA = randomUUID(), uidB = randomUUID(); await seedUser(admin, uidA); await seedUser(admin, uidB);
    const aid = randomUUID();
    const token = signAttempt({ aid, uid: uidA, items: ["FA-COORD", "FA-COORD2"], iat: 1, exp: 9_999_999_999_999 }, key);
    const c = new Client(CONN); await c.connect();
    // simulate the route: authenticated as user B, submitting user A's token
    const auth = authorizeSubmission({ token, authedUserId: uidB, answers: [{ id: "FA-COORD" }], key });
    if (auth.ok) await persistAttempt(pgRepo(c), { userId: uidB, attemptId: auth.attemptId, grade: grade(true) });
    const bRows = (await admin.query(`select count(*)::int n from foundation_attempt where user_id=$1`, [uidB])).rows[0].n;
    const aRows = (await admin.query(`select count(*)::int n from foundation_attempt where user_id=$1 and attempt_id=$2`, [uidA, aid])).rows[0].n;
    ok("D1 cross-user token rejected by the boundary (403) — no persist attempted", auth.ok === false && auth.status === 403, JSON.stringify(auth));
    ok("D1 NO row written for the impersonating user; owner's attempt untouched", bRows === 0 && aRows === 0, `userB rows=${bRows}, userA rows=${aRows}`);
    await c.end();
  }

  // ============ C: CONCURRENT HIGHEST-SCORE PRESERVATION (production persistAttempt + atomic RPC) ============
  // Two passing attempts with scores 24 and 32 complete concurrently; the authoritative stored score
  // must be 32 regardless of which wins the race (the DB GREATEST, not an app-memory max). Repeat with
  // reversed order; then a later failing attempt must not lower it.
  for (const [lo, hi, label] of [[24, 32, "A=24,B=32"], [32, 24, "A=32,B=24 (reversed)"]]) {
    const uid = randomUUID(); await seedUser(admin, uid);
    const aidLo = randomUUID(), aidHi = randomUUID();
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    await Promise.all([
      persistAttempt(pgRepo(c1), { userId: uid, attemptId: aidLo, grade: grade(true, lo) }),
      persistAttempt(pgRepo(c2), { userId: uid, attemptId: aidHi, grade: grade(true, hi) }),
    ]);
    const asmt = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [uid])).rows[0];
    ok(`C1 ${label}: stored assessment score is the MAX (32), passed=true`, asmt?.passed === true && asmt?.score === 32, JSON.stringify(asmt));
    // both individual attempt rows keep their OWN scores (no cross-overwrite, no duplicate)
    const rows = (await admin.query(`select attempt_id, score from foundation_attempt where user_id=$1`, [uid])).rows;
    const byId = Object.fromEntries(rows.map((r) => [r.attempt_id, r.score]));
    ok(`C1 ${label}: both attempts isolated (${lo} & ${hi}), no duplicate`, rows.length === 2 && byId[aidLo] === lo && byId[aidHi] === hi, JSON.stringify(byId));
    // a LATER failing attempt cannot lower the stored 32
    await persistAttempt(pgRepo(admin), { userId: uid, attemptId: randomUUID(), grade: grade(false, 3) });
    const after = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [uid])).rows[0];
    ok(`C1 ${label}: later failing attempt keeps passed=true, score=32`, after?.passed === true && after?.score === 32, JSON.stringify(after));
    await c1.end(); await c2.end();
  }

  // ---- C2: a race that OVERLAPS at the row-conflict point — lower score cannot overwrite the higher ----
  {
    const uid = randomUUID(); await seedUser(admin, uid);
    const c1 = new Client(CONN), c2 = new Client(CONN); await c1.connect(); await c2.connect();
    // high-score writer opens a tx, latches 32, holds it; low-score writer's latch(24) blocks on the row
    await c1.query("begin");
    await c1.query(`select public.foundation_latch_pass($1,'CH01',32,32)`, [uid]);
    let loDone = false;
    const loP = c2.query(`select public.foundation_latch_pass($1,'CH01',24,32)`, [uid]).then(() => { loDone = true; });
    await new Promise((r) => setTimeout(r, 200));
    const blockedMid = loDone === false; // low writer waits on the uncommitted row
    await c1.query("commit");
    await loP; await c2.query("commit").catch(() => {});
    const s = (await admin.query(`select passed, score from foundation_assessment where user_id=$1`, [uid])).rows[0];
    ok("C2 overlapping latch: low-score writer waited on the row lock", blockedMid);
    ok("C2 GREATEST wins: stored score stays 32 after the delayed 24 commits", s?.passed === true && s?.score === 32, JSON.stringify(s));
    await c1.end(); await c2.end();
  }

  await admin.end();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n# scenarios ${results.length}  pass ${results.length - failed.length}  fail ${failed.length}`);
  if (failed.length) { console.error("CONCURRENCY TESTS FAILED"); process.exit(1); }
  console.log("ALL_PG_CONCURRENCY_PASS");
}
main().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
